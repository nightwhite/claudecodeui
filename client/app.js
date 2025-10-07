// ==================== 全局状态 ====================
const API_BASE = 'http://localhost:3000/api';
let currentProject = null;
let currentSession = null;
let ws = null;
let claudeWs = null;
let selectedFiles = [];
let currentAssistantMessage = null; // 用于累积流式消息
let permissionMode = 'bypassPermissions'; // 固定使用 bypassPermissions 模式
let pendingToolCalls = new Map(); // 追踪正在执行的工具调用
let currentTodos = []; // 当前任务列表

// ==================== 工具函数 ====================
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || data.message || `HTTP ${response.status}`);
        }
        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

// ==================== 项目管理 ====================
async function loadProjects() {
    try {
        const projects = await apiRequest('/projects');
        displayProjects(projects);
    } catch (error) {
        showError('加载项目失败: ' + error.message);
    }
}

function displayProjects(projects) {
    const container = document.getElementById('projectsList');

    if (!projects || projects.length === 0) {
        container.innerHTML = '<div class="loading">暂无项目</div>';
        return;
    }

    container.innerHTML = projects.map(project => `
        <div class="project-item ${currentProject?.name === project.name ? 'active' : ''}"
             onclick="selectProject('${escapeHtml(project.name)}', '${escapeHtml(project.path)}', '${escapeHtml(project.displayName || project.name)}')">
            <h4>${escapeHtml(project.displayName || project.name)}</h4>
            <p>📂 ${escapeHtml(project.path || 'Unknown')}</p>
            <p>💬 ${project.sessionMeta?.total || 0} 个会话</p>
        </div>
    `).join('');
}

async function selectProject(name, path, displayName) {
    currentProject = { name, path, displayName };
    currentSession = null;

    // 更新 UI
    document.querySelectorAll('.project-item').forEach(el => el.classList.remove('active'));
    event.target.closest('.project-item')?.classList.add('active');

    // 显示会话区域
    document.getElementById('sessionsSection').style.display = 'block';

    // 加载会话列表
    await loadSessions(name);

    // 自动连接 Claude WebSocket
    await autoConnectClaude();
}

async function loadSessions(projectName) {
    try {
        const data = await apiRequest(`/projects/${projectName}/sessions`);
        displaySessions(data.sessions || []);
    } catch (error) {
        showError('加载会话失败: ' + error.message);
    }
}

function displaySessions(sessions) {
    const container = document.getElementById('sessionsList');

    if (!sessions || sessions.length === 0) {
        container.innerHTML = '<div class="loading">暂无会话</div>';
        return;
    }

    container.innerHTML = sessions.map(session => {
        const date = new Date(session.lastActivity || session.createdAt);
        const title = session.summary || session.firstMessage || '新对话';
        return `
            <div class="session-item ${currentSession?.id === session.id ? 'active' : ''}"
                 onclick="selectSession('${escapeHtml(session.id)}', '${escapeHtml(title)}')">
                <h4>${escapeHtml(title)}</h4>
                <p>${date.toLocaleDateString()} - ${session.messageCount || 0} 条消息</p>
            </div>
        `;
    }).join('');
}

async function selectSession(sessionId, title) {
    if (!currentProject) return;

    currentSession = { id: sessionId, title };

    // 更新 UI
    document.querySelectorAll('.session-item').forEach(el => el.classList.remove('active'));
    event.target.closest('.session-item')?.classList.add('active');

    // 显示对话界面
    showChatPage(title, false);

    // 加载历史消息
    await loadMessages(currentProject.name, sessionId);
}

async function loadMessages(projectName, sessionId) {
    try {
        const data = await apiRequest(`/projects/${projectName}/sessions/${sessionId}/messages`);

        // 处理服务器返回数组或对象的情况
        let messages = [];
        if (Array.isArray(data)) {
            messages = data;
        } else if (data.messages && Array.isArray(data.messages)) {
            messages = data.messages;
        }

        console.log('加载的消息:', messages);

        const container = document.getElementById('messagesList');

        if (messages.length === 0) {
            container.innerHTML = '<div class="loading">暂无消息</div>';
            return;
        }

        // 清空容器
        container.innerHTML = '';

        // 渲染每条消息（支持工具调用）
        for (const message of messages) {
            renderHistoryMessage(message);
        }

        // 滚动到底部
        scrollToBottom();
    } catch (error) {
        console.error('加载消息失败:', error);
        showError('加载消息失败: ' + error.message);
    }
}

// 渲染历史消息（支持工具调用）
function renderHistoryMessage(message) {
    const msg = message.message || message;
    const role = msg.role;

    // 处理 assistant 消息
    if (role === 'assistant' && msg.content && Array.isArray(msg.content)) {
        for (const content of msg.content) {
            if (content.type === 'text') {
                // 文本消息
                appendMessage('assistant', content.text);
            } else if (content.type === 'tool_use') {
                // 工具调用卡片
                const toolId = content.id;
                const toolName = content.name || '未知工具';
                const toolInput = formatToolInput(content.input);

                // 检查是否是 TodoWrite
                if (content.name === 'TodoWrite' && content.input?.todos) {
                    updateTodoList(content.input.todos);
                }

                // 创建工具卡片（状态设为 pending，后续会被 tool_result 更新）
                createToolCallCard(toolId, toolName, toolInput);
            }
        }
    }
    // 处理 user 消息中的 tool_result
    else if (role === 'user' && msg.content && Array.isArray(msg.content)) {
        for (const content of msg.content) {
            if (content.type === 'tool_result') {
                const toolId = content.tool_use_id;
                updateToolCallResult(toolId, content);
            } else if (content.type === 'text') {
                // 用户文本消息
                appendMessage('user', content.text);
            }
        }
    }
    // 处理普通文本消息
    else if (msg.content) {
        let content = '';
        if (typeof msg.content === 'string') {
            content = msg.content;
        } else if (Array.isArray(msg.content)) {
            content = msg.content
                .filter(c => c.type === 'text')
                .map(c => c.text)
                .join('\n');
        }
        if (content) {
            appendMessage(role, content);
        }
    }
}

function createMessageHTML(message) {
    // JSONL 格式: message 对象在 message.message 中
    const msg = message.message || message;
    const role = msg.role || message.role || message.sender || 'user';

    // 处理 content 可能是数组或字符串的情况
    let content = '';
    if (msg.content) {
        if (Array.isArray(msg.content)) {
            // Content 是数组，提取所有文本内容
            content = msg.content
                .filter(c => c.type === 'text')
                .map(c => c.text)
                .join('\n');
        } else if (typeof msg.content === 'string') {
            content = msg.content;
        }
    }

    // 如果还是没有内容，尝试其他字段
    if (!content) {
        content = message.text || message.content || '';
    }

    const time = formatTime(message.timestamp || message.createdAt || Date.now());

    return `
        <div class="message ${role}">
            <div class="message-header">
                <span class="message-sender">${role === 'user' ? '你' : 'Claude'}</span>
                <span class="message-time">${time}</span>
            </div>
            <div class="message-content">${formatMessageContent(content)}</div>
        </div>
    `;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function createNewSession() {
    if (!currentProject) {
        showError('请先选择一个项目');
        return;
    }

    currentSession = { id: null, title: '新对话', isNew: true };

    // 清除选中状态
    document.querySelectorAll('.session-item').forEach(el => el.classList.remove('active'));

    // 显示对话界面
    showChatPage('新对话', true);
}

function showChatPage(title, isNew) {
    document.getElementById('welcomePage').style.display = 'none';
    document.getElementById('chatPage').style.display = 'flex';
    document.getElementById('chatTitle').textContent = title;
    document.getElementById('chatProject').textContent = currentProject?.displayName || '';

    if (isNew) {
        document.getElementById('messagesList').innerHTML = '';
    }
}

// ==================== 对话功能 ====================
function handleKeyDown(event) {
    if (event.key === 'Enter') {
        if (event.shiftKey) {
            // Shift+Enter: 换行（允许默认行为）
            return;
        } else {
            // Enter: 发送消息
            event.preventDefault();
            sendMessage();
        }
    }
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();

    if (!message && selectedFiles.length === 0) return;
    if (!currentProject) {
        showError('请先选择一个项目');
        return;
    }

    // 显示用户消息
    if (message) {
        appendMessage('user', message);
        input.value = '';
    }

    // 自动调整高度
    input.style.height = 'auto';

    // 切换按钮状态：隐藏发送按钮，显示终止按钮
    toggleSendAbortButtons(true);

    // 连接 Claude WebSocket 并发送消息
    await sendToClaude(message);
}

async function sendToClaude(command) {
    // 确保 WebSocket 已连接
    if (!claudeWs || claudeWs.readyState !== WebSocket.OPEN) {
        updateClaudeStatus('connecting', 'Claude 连接中...');
        try {
            await connectClaudeWS();
        } catch (error) {
            showError('无法连接到 Claude，请检查服务器状态');
            return;
        }
    }

    // 准备选项
    const options = {
        cwd: currentProject.path,
        projectPath: currentProject.path
    };

    // 如果是新会话，不传 sessionId
    if (currentSession && currentSession.id && !currentSession.isNew) {
        options.sessionId = currentSession.id;
        options.resume = true;
    }

    // 处理图片
    if (selectedFiles.length > 0) {
        options.images = await Promise.all(selectedFiles.map(async file => {
            const base64 = await fileToBase64(file);
            return {
                name: file.name,
                data: base64,
                size: file.size,
                mimeType: file.type
            };
        }));
    }

    // 固定使用 bypassPermissions 模式
    options.permissionMode = 'bypassPermissions';

    // 发送命令
    claudeWs.send(JSON.stringify({
        type: 'claude-command',
        command: command || undefined,
        options
    }));

    // 清除已选文件
    selectedFiles = [];
    document.getElementById('filePreview').style.display = 'none';
}

// 自动连接 Claude (选择项目时调用)
async function autoConnectClaude() {
    updateClaudeStatus('connecting', 'Claude 连接中...');

    try {
        await connectClaudeWS();
        updateClaudeStatus('connected', 'Claude 已连接');
    } catch (error) {
        updateClaudeStatus('error', 'Claude 连接失败');
        console.error('自动连接失败:', error);
    }
}

function connectClaudeWS() {
    return new Promise((resolve, reject) => {
        if (claudeWs && claudeWs.readyState === WebSocket.OPEN) {
            resolve();
            return;
        }

        const wsUrl = `ws://localhost:3000/api/claude/ws`;
        claudeWs = new WebSocket(wsUrl);

        let connectTimeout = setTimeout(() => {
            reject(new Error('连接超时'));
        }, 10000);

        claudeWs.onopen = () => {
            clearTimeout(connectTimeout);
            console.log('Claude WebSocket 连接成功');
            updateClaudeStatus('connected', 'Claude 已连接');
            resolve();
        };

        claudeWs.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleClaudeMessage(data);
            } catch (error) {
                console.error('解析 Claude 消息失败:', error);
            }
        };

        claudeWs.onerror = (error) => {
            clearTimeout(connectTimeout);
            console.error('Claude WebSocket 错误:', error);
            updateClaudeStatus('error', 'Claude 连接失败');
            reject(error);
        };

        claudeWs.onclose = () => {
            console.log('Claude WebSocket 关闭');
            updateClaudeStatus('disconnected', 'Claude 未连接');
        };
    });
}

// 更新 Claude 连接状态
function updateClaudeStatus(status, text) {
    const statusEl = document.getElementById('claudeStatus');
    if (!statusEl) return;

    statusEl.className = 'claude-status ' + status;
    statusEl.querySelector('.status-text').textContent = text;
}

// 点击状态指示器重新连接
async function handleStatusClick() {
    if (!currentProject) return;

    const statusEl = document.getElementById('claudeStatus');
    if (statusEl.classList.contains('connecting')) return; // 正在连接中，不重复连接

    await autoConnectClaude();
}

function handleClaudeMessage(data) {
    switch (data.type) {
        case 'session-created':
            // 新会话创建，保存 sessionId
            if (currentSession && currentSession.isNew) {
                currentSession.id = data.sessionId;
                currentSession.isNew = false;
            }
            break;

        case 'claude-response':
            // Claude 的响应
            if (data.data) {
                handleClaudeResponse(data.data);
            }
            break;

        case 'claude-complete':
            // 对话完成
            currentAssistantMessage = null;
            pendingToolCalls.clear();
            // 恢复发送按钮
            toggleSendAbortButtons(false);
            // 重新加载会话列表
            if (currentProject) {
                loadSessions(currentProject.name);
            }
            break;

        case 'claude-error':
            console.error('❌ Claude error:', data.error);
            currentAssistantMessage = null;
            pendingToolCalls.clear();
            // 恢复发送按钮
            toggleSendAbortButtons(false);
            showError('Claude 错误: ' + data.error);
            break;

        default:
            console.warn('⚠️ Unknown message type:', data.type);
            break;
    }
}

function handleClaudeResponse(response) {
    console.log('📨 Claude Response:', response.type);

    // 处理系统初始化
    if (response.type === 'system' && response.subtype === 'init') {
        // 不预先创建消息容器，等有文本内容时再创建
        currentAssistantMessage = null;
        appendSystemMessage('🚀 会话初始化');
        return;
    }

    // 处理错误结果
    if (response.type === 'result' && response.is_error) {
        currentAssistantMessage = null;
        showError(response.result || '执行失败');
        appendSystemMessage('❌ ' + (response.result || '执行失败'));
        return;
    }

    // 处理成功结果 - 显示统计信息
    if (response.type === 'result' && !response.is_error) {
        currentAssistantMessage = null;
        pendingToolCalls.clear();

        const stats = [];
        if (response.total_cost_usd) {
            stats.push(`💰 $${response.total_cost_usd.toFixed(6)}`);
        }
        if (response.duration_ms) {
            stats.push(`⏱️ ${(response.duration_ms / 1000).toFixed(1)}s`);
        }
        if (response.num_turns) {
            stats.push(`🔄 ${response.num_turns}轮`);
        }

        if (stats.length > 0) {
            appendSystemMessage('✅ 完成 - ' + stats.join(' | '));
        }
        return;
    }

    // 处理 assistant 消息 - 流式更新
    if (response.type === 'assistant' && response.message) {
        const message = response.message;

        // 检查是否有错误内容
        if (message.content && Array.isArray(message.content)) {
            for (const content of message.content) {
                if (content.type === 'text') {
                    // 检查是否是 API key 错误
                    if (content.text && content.text.includes('Invalid API key')) {
                        currentAssistantMessage = null;
                        showError('Claude API Key 无效，请运行 claude login 登录');
                        appendSystemMessage('❌ API Key 无效，请运行: claude login');
                        return;
                    }

                    // 如果没有流式消息容器，创建新的
                    if (!currentAssistantMessage) {
                        currentAssistantMessage = createStreamingMessage();
                    }

                    // 流式追加文本
                    appendToStreamingMessage(content.text);
                } else if (content.type === 'tool_use') {
                    // 工具调用前，先关闭当前的流式消息
                    currentAssistantMessage = null;

                    // 处理 TodoWrite 工具调用
                    if (content.name === 'TodoWrite' && content.input?.todos) {
                        updateTodoList(content.input.todos);
                    }

                    // 创建工具调用卡片
                    const toolId = content.id;
                    const toolName = content.name || '未知工具';
                    const toolInput = formatToolInput(content.input);
                    createToolCallCard(toolId, toolName, toolInput);
                    pendingToolCalls.set(toolId, { name: toolName, input: toolInput });
                }
            }
        }
        return;
    }


    // 处理 user 消息中的 tool_result
    if (response.type === 'user' && response.message) {
        const message = response.message;
        if (message.content && Array.isArray(message.content)) {
            for (const content of message.content) {
                if (content.type === 'tool_result') {
                    const toolId = content.tool_use_id;
                    updateToolCallResult(toolId, content);
                    pendingToolCalls.delete(toolId);
                }
            }
        }
        return;
    }

    // 其他类型的消息记录到控制台并显示
    console.warn('未处理的消息类型:', response.type, response);

    // 尝试提取并显示未知类型的文本内容
    if (response.content) {
        if (typeof response.content === 'string') {
            appendSystemMessage(`📝 ${response.type}: ${response.content}`);
        } else if (Array.isArray(response.content)) {
            for (const item of response.content) {
                if (item.type === 'text' && item.text) {
                    appendSystemMessage(`📝 ${response.type}: ${item.text}`);
                }
            }
        }
    }
}

// 格式化工具输入参数
function formatToolInput(input) {
    if (!input) return '';

    // 常见工具的格式化
    if (input.command) return input.command;
    if (input.pattern) return input.pattern;
    if (input.file_path) return input.file_path;
    if (input.path) return input.path;

    // 通用格式化
    const json = JSON.stringify(input, null, 2);
    if (json.length > 300) {
        return json.substring(0, 300) + '...';
    }
    return json;
}

// 创建工具调用卡片
function createToolCallCard(toolId, toolName, toolInput) {
    const container = document.getElementById('messagesList');
    const cardHTML = `
        <div class="tool-call-card" id="tool-${toolId}">
            <div class="tool-header">
                <span class="tool-icon">🔧</span>
                <span class="tool-name">${escapeHtml(toolName)}</span>
                <span class="tool-status executing">执行中...</span>
            </div>
            <div class="tool-input"><code>${escapeHtml(toolInput)}</code></div>
            <div class="tool-result" style="display: none;"></div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', cardHTML);
    scrollToBottom();
}

// 更新工具调用结果
function updateToolCallResult(toolId, result) {
    const card = document.getElementById('tool-' + toolId);
    if (!card) return;

    const statusEl = card.querySelector('.tool-status');
    const resultEl = card.querySelector('.tool-result');

    const isError = result.is_error;
    const resultText = extractToolResultText(result);

    // 更新状态
    statusEl.className = 'tool-status ' + (isError ? 'error' : 'success');
    statusEl.textContent = isError ? '❌ 失败' : '✅ 成功';

    // 显示结果（如果有内容）
    if (resultText && resultText.trim()) {
        resultEl.style.display = 'block';
        // 限制显示长度，提供展开功能
        if (resultText.length > 1000) {
            const shortText = resultText.substring(0, 1000);
            resultEl.innerHTML = `
                <pre class="tool-output collapsed">${escapeHtml(shortText)}</pre>
                <button class="expand-btn" onclick="toggleToolOutput('${toolId}')">显示完整输出 (${resultText.length} 字符)</button>
                <pre class="tool-output full" style="display:none;">${escapeHtml(resultText)}</pre>
            `;
        } else {
            resultEl.innerHTML = `<pre class="tool-output">${escapeHtml(resultText)}</pre>`;
        }
    }

    scrollToBottom();
}

// 切换工具输出显示
function toggleToolOutput(toolId) {
    const card = document.getElementById('tool-' + toolId);
    if (!card) return;

    const collapsed = card.querySelector('.tool-output.collapsed');
    const full = card.querySelector('.tool-output.full');
    const btn = card.querySelector('.expand-btn');

    if (collapsed.style.display === 'none') {
        collapsed.style.display = 'block';
        full.style.display = 'none';
        btn.textContent = '显示完整输出';
    } else {
        collapsed.style.display = 'none';
        full.style.display = 'block';
        btn.textContent = '收起输出';
    }
}

// 提取工具结果文本
function extractToolResultText(result) {
    let text = '';

    if (typeof result.content === 'string') {
        text = result.content;
    } else if (Array.isArray(result.content)) {
        text = result.content
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join('\n');
    }

    return text;
}

// 更新任务列表
function updateTodoList(todos) {
    currentTodos = todos;

    const todoPanel = document.getElementById('todoPanel');
    const todoList = document.getElementById('todoList');

    if (!todos || todos.length === 0) {
        todoPanel.style.display = 'none';
        return;
    }

    // 显示任务面板
    todoPanel.style.display = 'block';

    // 渲染任务列表
    todoList.innerHTML = todos.map(todo => {
        const statusIcon = todo.status === 'completed' ? '✅' :
                          todo.status === 'in_progress' ? '🔄' :
                          '⏸️';
        const statusClass = todo.status === 'completed' ? 'completed' :
                           todo.status === 'in_progress' ? 'in-progress' :
                           'pending';

        return `
            <div class="todo-item ${statusClass}">
                <span class="todo-status">${statusIcon}</span>
                <span class="todo-content">${escapeHtml(todo.content)}</span>
            </div>
        `;
    }).join('');
}

// 切换任务面板显示
function toggleTodoPanel() {
    const todoPanel = document.getElementById('todoPanel');
    if (todoPanel.style.display === 'none') {
        todoPanel.style.display = 'block';
    } else {
        todoPanel.style.display = 'none';
    }
}

// 切换发送/终止按钮
function toggleSendAbortButtons(isRunning) {
    const sendBtn = document.getElementById('sendBtn');
    const abortBtn = document.getElementById('abortBtn');

    if (isRunning) {
        sendBtn.style.display = 'none';
        abortBtn.style.display = 'flex';
    } else {
        sendBtn.style.display = 'flex';
        abortBtn.style.display = 'none';
    }
}

// 终止 Claude 会话
async function abortClaudeSession() {
    if (!currentSession || !currentSession.id) {
        showError('没有活跃的会话');
        return;
    }

    if (!confirm('确定要终止当前对话吗？')) {
        return;
    }

    try {
        // 调用终止 API
        await apiRequest(`/claude/abort/${currentSession.id}`, {
            method: 'POST'
        });

        // 显示终止消息
        appendSystemMessage('⚠️ 对话已被用户终止');

        // 清理状态
        currentAssistantMessage = null;
        pendingToolCalls.clear();

        // 恢复发送按钮
        toggleSendAbortButtons(false);

    } catch (error) {
        console.error('终止会话失败:', error);
        showError('终止会话失败: ' + error.message);

        // 即使失败也恢复按钮
        toggleSendAbortButtons(false);
    }
}

// 创建流式消息容器
function createStreamingMessage() {
    const container = document.getElementById('messagesList');
    const messageId = 'msg-' + Date.now();

    const messageHTML = `
        <div class="message assistant" id="${messageId}">
            <div class="message-header">
                <span class="message-sender">Claude</span>
                <span class="message-time">${formatTime(Date.now())}</span>
            </div>
            <div class="message-content"></div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', messageHTML);
    scrollToBottom();

    return {
        id: messageId,
        content: ''
    };
}

// 流式追加文本到当前消息
function appendToStreamingMessage(text) {
    if (!currentAssistantMessage) return;

    const messageEl = document.getElementById(currentAssistantMessage.id);
    if (!messageEl) return;

    currentAssistantMessage.content += text;
    const contentEl = messageEl.querySelector('.message-content');

    // 使用 innerHTML 支持格式化，但要先转义
    contentEl.innerHTML = formatMessageContent(currentAssistantMessage.content);

    scrollToBottom();
}

// 格式化消息内容（保留换行等）
function formatMessageContent(text) {
    return escapeHtml(text).replace(/\n/g, '<br>');
}

function appendMessage(role, content) {
    const container = document.getElementById('messagesList');
    const messageHTML = createMessageHTML({
        role,
        content,
        timestamp: Date.now()
    });

    container.insertAdjacentHTML('beforeend', messageHTML);
    scrollToBottom();
}

function appendSystemMessage(content) {
    const container = document.getElementById('messagesList');
    // 使用 formatMessageContent 来保留换行符
    const formattedContent = formatMessageContent(content);
    container.insertAdjacentHTML('beforeend', `
        <div class="message system">
            <div class="message-content">${formattedContent}</div>
        </div>
    `);
    scrollToBottom();
}

function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    container.scrollTop = container.scrollHeight;
}

function clearChat() {
    if (confirm('确定要清空当前对话吗？')) {
        document.getElementById('messagesList').innerHTML = '';
        // 清空任务列表
        currentTodos = [];
        document.getElementById('todoPanel').style.display = 'none';
        document.getElementById('todoList').innerHTML = '';
    }
}

// ==================== 文件上传 ====================
function triggerFileUpload() {
    document.getElementById('fileInput').click();
}

function handleFileSelect(event) {
    const files = Array.from(event.target.files);
    selectedFiles = [...selectedFiles, ...files];
    displayFilePreview();
}

function displayFilePreview() {
    const preview = document.getElementById('filePreview');

    if (selectedFiles.length === 0) {
        preview.style.display = 'none';
        return;
    }

    preview.style.display = 'block';
    preview.innerHTML = selectedFiles.map((file, index) => `
        <span class="file-tag">
            📎 ${file.name} (${formatFileSize(file.size)})
            <button onclick="removeFile(${index})">&times;</button>
        </span>
    `).join('');
}

function removeFile(index) {
    selectedFiles.splice(index, 1);
    displayFilePreview();
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ==================== 对话框管理 ====================
function showCreateProjectDialog() {
    document.getElementById('createProjectDialog').style.display = 'flex';
}

function closeCreateProjectDialog() {
    document.getElementById('createProjectDialog').style.display = 'none';
    document.getElementById('newProjectPath').value = '';
}

async function createProject() {
    const path = document.getElementById('newProjectPath').value.trim();

    if (!path) {
        showError('请输入项目路径');
        return;
    }

    try {
        await apiRequest('/projects/create', {
            method: 'POST',
            body: JSON.stringify({ path })
        });

        closeCreateProjectDialog();
        await loadProjects();
        showSuccess('项目创建成功');
    } catch (error) {
        showError('创建项目失败: ' + error.message);
    }
}

async function showSettingsDialog() {
    document.getElementById('settingsDialog').style.display = 'flex';
    await loadEnvVars();
}

function closeSettingsDialog() {
    document.getElementById('settingsDialog').style.display = 'none';
}

async function loadEnvVars() {
    try {
        // 先从 localStorage 加载缓存的环境变量
        const cachedEnvVars = localStorage.getItem('claudeEnvVars');
        if (cachedEnvVars) {
            const envVars = JSON.parse(cachedEnvVars);
            displayEnvVars(envVars);

            // 后台同步到服务器（等待完成）
            await syncEnvVarsToServer(envVars);
        }

        // 从服务器加载最新数据
        const data = await apiRequest('/claudeEnv');
        // 服务端返回的是 { envVars: [...] } 数组格式
        const serverEnvVars = data.envVars || [];

        // 合并服务器数据和 localStorage 数据
        // 服务器返回的敏感值被隐藏为 ***HIDDEN***，需要用 localStorage 的真实值替换
        let finalEnvVars = serverEnvVars;
        if (cachedEnvVars) {
            const cachedVars = JSON.parse(cachedEnvVars);
            const cachedMap = new Map(cachedVars.map(v => [v.key, v.value]));

            finalEnvVars = serverEnvVars.map(serverVar => {
                // 如果服务器返回的是隐藏值，使用 localStorage 的真实值
                if (serverVar.value === '***HIDDEN***' && cachedMap.has(serverVar.key)) {
                    return { ...serverVar, value: cachedMap.get(serverVar.key) };
                }
                return serverVar;
            });

            // 如果服务器没有数据，使用 localStorage 数据
            if (finalEnvVars.length === 0) {
                finalEnvVars = cachedVars;
            }
        }

        // 保存到 localStorage
        localStorage.setItem('claudeEnvVars', JSON.stringify(finalEnvVars));

        displayEnvVars(finalEnvVars);
    } catch (error) {
        console.error('加载环境变量失败:', error);

        // 如果服务器失败，使用缓存的数据
        const cachedEnvVars = localStorage.getItem('claudeEnvVars');
        if (cachedEnvVars) {
            displayEnvVars(JSON.parse(cachedEnvVars));
        }
    }
}

// 后台同步环境变量到服务器
async function syncEnvVarsToServer(envVars) {
    for (const env of envVars) {
        try {
            await apiRequest(`/claudeEnv/${encodeURIComponent(env.key)}`, {
                method: 'PUT',
                body: JSON.stringify({ value: env.value || '' })
            });
        } catch (error) {
            console.error(`同步环境变量 ${env.key} 失败:`, error);
        }
    }
}

function displayEnvVars(envVars) {
    const container = document.getElementById('envList');

    if (!envVars || envVars.length === 0) {
        container.innerHTML = '<div class="loading">暂无环境变量</div>';
        return;
    }

    container.innerHTML = envVars.map(env => `
        <div class="env-item">
            <div>
                <span class="env-key">${escapeHtml(env.key)}</span>
                <span class="env-value">= ${escapeHtml(env.value)}</span>
            </div>
            <button onclick="deleteEnvVar('${escapeHtml(env.key)}')">删除</button>
        </div>
    `).join('');
}

async function addEnvVar() {
    const key = document.getElementById('envKey').value.trim();
    const value = document.getElementById('envValue').value.trim();

    if (!key) {
        showError('请输入变量名');
        return;
    }

    try {
        // 使用 PUT 方法
        await apiRequest(`/claudeEnv/${encodeURIComponent(key)}`, {
            method: 'PUT',
            body: JSON.stringify({ value: value || '' })
        });

        // 更新 localStorage
        const cachedEnvVars = localStorage.getItem('claudeEnvVars');
        let envVars = cachedEnvVars ? JSON.parse(cachedEnvVars) : [];

        // 移除旧的同名变量
        envVars = envVars.filter(env => env.key !== key);
        // 添加新变量
        envVars.push({ key, value: value || '' });

        localStorage.setItem('claudeEnvVars', JSON.stringify(envVars));

        document.getElementById('envKey').value = '';
        document.getElementById('envValue').value = '';
        await loadEnvVars();
        showSuccess('环境变量已添加');
    } catch (error) {
        showError('添加失败: ' + error.message);
    }
}

async function deleteEnvVar(key) {
    if (!confirm(`确定删除环境变量 ${key}?`)) return;

    try {
        await apiRequest(`/claudeEnv/${encodeURIComponent(key)}`, {
            method: 'DELETE'
        });

        // 更新 localStorage
        const cachedEnvVars = localStorage.getItem('claudeEnvVars');
        if (cachedEnvVars) {
            let envVars = JSON.parse(cachedEnvVars);
            envVars = envVars.filter(env => env.key !== key);
            localStorage.setItem('claudeEnvVars', JSON.stringify(envVars));
        }

        await loadEnvVars();
        showSuccess('环境变量已删除');
    } catch (error) {
        showError('删除失败: ' + error.message);
    }
}

// ==================== 提示消息 ====================
function showError(message) {
    // 简单的 alert，可以后续优化为 toast
    alert('❌ ' + message);
}

function showSuccess(message) {
    // 简单的 alert，可以后续优化为 toast
    console.log('✅ ' + message);
}

// ==================== 初始化环境变量同步 ====================
async function syncEnvVarsOnInit() {
    try {
        const cachedEnvVars = localStorage.getItem('claudeEnvVars');
        if (cachedEnvVars) {
            const envVars = JSON.parse(cachedEnvVars);
            if (envVars.length > 0) {
                console.log('🔄 正在同步环境变量到服务器...', envVars.map(e => e.key));
                await syncEnvVarsToServer(envVars);
                console.log('✅ 环境变量同步完成');
            }
        }
    } catch (error) {
        console.error('❌ 环境变量同步失败:', error);
    }
}

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Claude Code Web IDE 初始化...');

    // 优先同步环境变量到服务器（从 localStorage）
    await syncEnvVarsOnInit();

    // 加载项目列表
    await loadProjects();

    // 自动调整 textarea 高度
    const textarea = document.getElementById('messageInput');
    textarea.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
    });
});
