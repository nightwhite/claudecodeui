# 🦊 Bun Server API 测试客户端

一个简单的 HTML + JS + CSS 客户端，用于测试 Bun Server 的所有 API 功能。**无需认证，直接使用！**

## 🚀 快速开始

### 1. 启动 Bun Server

```bash
cd bun-server
bun run dev
```

### 2. 访问客户端

打开浏览器: **http://localhost:3000**

页面加载后会自动检查服务器健康状态，无需登录即可使用所有功能！

## 📋 功能列表

### ✅ 已实现的 API 测试

#### 💓 健康检查
- `GET /api/health` - 服务器状态检查

#### 📁 项目管理
- `GET /api/projects` - 获取项目列表
- `POST /api/projects/create` - 创建项目
- `GET /api/projects/:name/sessions` - 查看项目会话
- `DELETE /api/projects/:name` - 删除项目

#### 📄 项目文件操作 (相对路径)
- `GET /api/projects/:name/file` - 读取项目文件
- `PUT /api/projects/:name/file` - 保存项目文件
- `GET /api/projects/:name/files` - 获取文件树

#### 🗂️ 系统文件操作 (绝对路径)
- `GET /api/files` - 读取系统文件
- `PUT /api/files` - 保存系统文件
- `GET /api/files/content` - 获取二进制文件

#### 🤖 Claude CLI
- `POST /api/claude/spawn` - 执行 Claude 命令
- `GET /api/claude/sessions` - 查看活跃会话
- `WS /api/claude/ws` - Claude WebSocket 连接

#### 🔧 Claude 环境变量
- `GET /api/claudeEnv` - 获取所有环境变量
- `GET /api/claudeEnv/:key` - 获取指定环境变量
- `POST /api/claudeEnv/:key` - 设置环境变量
- `DELETE /api/claudeEnv/:key` - 删除环境变量

#### 🎤 音频转录
- `POST /api/transcribe` - Whisper API 转录
  - 支持模式: default / prompt / vibe / instructions

#### 🔗 WebSocket
- `WS /api/ws` - 实时消息推送
- 项目文件变化通知
- Claude 命令执行状态

## 🎯 快速测试流程

### 1. 健康检查 (自动执行)
页面加载后自动检查，显示服务器状态和时间。

### 2. 测试项目管理
1. 点击"获取项目列表"查看 Claude 项目
2. 点击"创建项目"，输入路径如 `/tmp/test-project`
3. 点击项目的"查看会话"按钮

### 3. 测试文件操作
```bash
# 先创建测试文件
echo "Hello Bun!" > /tmp/test.txt
```

**项目文件操作**:
- 项目名称: 填入项目名 (如 `Users-xxx-project`)
- 文件路径: 填入相对路径 (如 `README.md`)

**系统文件操作**:
- 文件路径: 填入绝对路径 (如 `/tmp/test.txt`)
- 点击"读取系统文件"查看内容

### 4. 测试 Claude CLI
1. 项目路径: `/path/to/your/project`
2. Claude 命令: `help me`
3. 点击"执行命令"查看结果
4. 或点击"连接 Claude WebSocket"进行实时交互

### 5. 测试环境变量
1. 点击"获取所有环境变量"
2. 输入变量名 `TEST_VAR`，值 `hello`
3. 点击"设置环境变量"
4. 点击"获取指定变量"验证

### 6. 测试 WebSocket
1. 点击"连接 WebSocket"
2. 查看连接状态
3. 在其他项目中修改文件，观察实时推送

## 🔧 技术实现

- **纯 HTML/JS/CSS** - 无构建工具，直接运行
- **Fetch API** - 所有 HTTP 请求
- **WebSocket API** - 实时通信
- **无认证** - 直接访问 API (符合 bun-server 设计)

## 📁 文件结构

```
client/
├── index.html    # 主页面 - 所有功能模块
├── style.css     # 样式 - 响应式设计
├── app.js        # 逻辑 - API 调用
└── README.md     # 本文档
```

## 🐛 常见问题

### Q: 页面显示 404
**A**: 确认服务器正在运行 `bun run dev`，访问 http://localhost:3000

### Q: API 请求失败
**A**:
1. 检查浏览器控制台的错误信息
2. 确认服务器端口是 3000
3. 查看服务器日志

### Q: WebSocket 连接失败
**A**:
1. 确认服务器支持 WebSocket
2. 检查浏览器控制台的 WebSocket 错误
3. 尝试刷新页面重新连接

### Q: 音频转录失败
**A**: 需要在服务器设置 `OPENAI_API_KEY` 环境变量

## 📚 相关文档

- **API 文档**: http://localhost:3000/swagger
- **项目主文档**: [../../CLAUDE.md](../../CLAUDE.md)
- **迁移进度**: [../PROGRESS_SUMMARY.md](../PROGRESS_SUMMARY.md)

## 🎉 开始测试

现在就启动服务器，打开浏览器开始测试吧！

```bash
cd bun-server
bun run dev
# 打开 http://localhost:3000
```

所有 API 功能都可以直接测试，无需任何配置！🚀
