# 🧪 快速测试指南

## 🚀 启动步骤

### 1. 启动 Bun Server

```bash
# 在 bun-server 目录下
bun run dev
```

服务器启动后会显示:
```
🦊 Server started at http://localhost:3000
```

### 2. 访问客户端

打开浏览器访问: **http://localhost:3000**

## ✅ 快速测试流程 (5 分钟)

### Step 1: 注册/登录 (30秒)

1. 页面打开后，看到"未登录"状态
2. 可以直接使用默认凭据登录:
   - 用户名: `admin`
   - 密码: `admin123`
3. 点击"登录"按钮
4. 看到"已登录: admin"，所有功能模块自动显示

> 💡 如果默认用户不存在，先点击"注册"标签创建 admin 用户

### Step 2: 测试健康检查 (10秒)

打开浏览器开发者工具 (F12)，在 Console 中输入:

```javascript
fetch('http://localhost:3000/api/health').then(r => r.json()).then(console.log)
```

应该看到:
```json
{
  "status": "ok",
  "timestamp": "2025-10-06T..."
}
```

### Step 3: 测试项目管理 (1分钟)

1. 在"📁 项目管理"区域，点击"刷新项目列表"
2. 查看现有的 Claude 项目
3. 点击"创建项目"，输入一个测试路径: `/tmp/test-project`
4. 查看项目列表中是否出现新项目
5. 点击项目的"查看会话"按钮，在日志中查看会话信息

### Step 4: 测试文件操作 (1分钟)

1. 在"📄 文件操作"区域
2. 创建一个测试文件:
   ```bash
   # 在终端执行
   echo "Hello from Bun Server!" > /tmp/test.txt
   ```
3. 在文件路径输入框输入: `/tmp/test.txt`
4. 点击"读取文件"，应该看到文件内容显示在文本框中
5. 修改文本框内容，点击"保存文件"
6. 再次点击"读取文件"验证修改

### Step 5: 测试 Claude CLI (1分钟)

1. 在"🤖 Claude CLI"区域
2. 项目路径输入: `/tmp/test-project` (或你的实际项目路径)
3. Claude 命令输入: `hello`
4. 点击"执行命令"
5. 在输出区域查看 Claude 的响应
6. 点击"查看活跃会话"查看当前运行的会话

> ⚠️ 确保你的系统已安装 Claude CLI: `claude --version`

### Step 6: 测试 WebSocket (30秒)

1. 在"🔗 WebSocket 连接"区域
2. 点击"连接 WebSocket"
3. 看到状态变为"已连接"(绿色)
4. 观察"操作日志"区域，应该看到连接成功的日志
5. 如果有项目文件变化，会在消息区域看到实时推送
6. 点击"断开连接"测试断开功能

### Step 7: 测试音频转录 (1分钟，可选)

> ⚠️ 需要配置 `OPENAI_API_KEY` 环境变量

1. 准备一个音频文件 (如录音、.mp3 等)
2. 在"🎤 音频转录"区域点击"选择文件"
3. 选择转录模式 (默认即可)
4. 点击"转录"按钮
5. 等待几秒，查看转录结果

## 📊 验证结果

### 日志检查

在页面底部的"📋 操作日志"区域，你应该看到类似:

```
[22:30:15] ℹ️ 页面加载完成
[22:30:18] ℹ️ 发送请求: POST /auth/login
[22:30:18] ✅ 请求成功: /auth/login
[22:30:18] ✅ 登录成功: admin
[22:30:20] ℹ️ 发送请求: GET /projects
[22:30:20] ✅ 请求成功: /projects
[22:30:25] ℹ️ 发送请求: GET /files?path=/tmp/test.txt
[22:30:25] ✅ 请求成功: /files
[22:30:25] ✅ 文件读取成功: /tmp/test.txt
```

### 浏览器开发者工具检查

打开 F12 开发者工具:

1. **Network 标签**: 查看所有 API 请求，确保返回 200 状态码
2. **Console 标签**: 不应该有红色错误信息
3. **Application > LocalStorage**: 应该看到 `authToken` 已保存
4. **WebSocket 标签**: 查看 WebSocket 连接和消息

## 🎯 API 覆盖率

测试完成后，你已经验证了以下 API:

- ✅ `POST /api/auth/login` - 用户登录
- ✅ `POST /api/auth/register` - 用户注册
- ✅ `GET /api/auth/status` - 认证状态
- ✅ `GET /api/health` - 健康检查
- ✅ `GET /api/projects` - 项目列表
- ✅ `POST /api/projects/create` - 创建项目
- ✅ `GET /api/projects/:name/sessions` - 项目会话
- ✅ `GET /api/files` - 读取文件
- ✅ `PUT /api/files` - 保存文件
- ✅ `POST /api/claude/spawn` - 执行 Claude 命令
- ✅ `GET /api/claude/sessions` - 活跃会话
- ✅ `WS /api/ws` - WebSocket 连接
- ⏸️ `POST /api/transcribe` - 音频转录 (需要 API key)

## 🐛 常见问题排查

### 问题: 页面显示 404

**解决方案**:
1. 确认服务器正在运行: `bun run dev`
2. 检查端口是否正确: http://localhost:3000
3. 查看服务器日志是否有错误

### 问题: 登录失败

**解决方案**:
1. 先注册一个新用户
2. 检查浏览器控制台是否有 CORS 错误
3. 确认服务器已启用 CORS: `server.ts` 中有 `.use(cors())`

### 问题: 项目列表为空

**解决方案**:
1. 确认 `~/.claude/projects/` 目录存在
2. 检查是否有 Claude 项目
3. 尝试手动创建一个项目

### 问题: WebSocket 连接失败

**解决方案**:
1. 确认已登录并有有效 token
2. 检查浏览器控制台的 WebSocket 错误
3. 确认服务器支持 WebSocket 路由

### 问题: Claude CLI 执行失败

**解决方案**:
1. 确认已安装 Claude CLI: `which claude`
2. 检查项目路径是否正确
3. 查看服务器日志中的错误信息

## 📚 进阶测试

### 使用 Swagger UI

访问: **http://localhost:3000/swagger**

Swagger UI 提供了完整的 API 文档和在线测试工具:

1. 点击右上角"Authorize"按钮
2. 输入 Bearer token (从 localStorage 获取)
3. 测试任意 API 端点

### 使用 curl 测试

```bash
# 健康检查
curl http://localhost:3000/api/health

# 登录获取 token
TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r .token)

# 获取项目列表
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/projects
```

## 🎉 测试完成

如果所有测试都通过，恭喜！你的 Bun Server 已经完全就绪！

**下一步**:
- 集成到实际项目中
- 添加更多自定义功能
- 优化性能和错误处理
- 部署到生产环境

---

**Happy Testing!** 🚀
