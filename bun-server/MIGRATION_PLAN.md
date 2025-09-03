# Claude Code UI 服务器迁移计划

## 🎯 目标
将 Node.js + Express 服务器完全迁移到 Bun + Elysia

## 📋 迁移架构对比

| 组件 | 原服务器 (Node.js + Express) | 新服务器 (Bun + Elysia) |
|------|------------------------------|--------------------------|
| **框架** | Express + HTTP + WebSocket | Elysia + Bun WebSocket |
| **数据库** | better-sqlite3 | bun:sqlite |
| **认证** | jsonwebtoken + bcrypt | @elysiajs/jwt + Bun.password |
| **文件上传** | multer | @elysiajs/multipart |
| **进程管理** | child_process + node-pty | Bun.spawn + node-pty |
| **文件监控** | chokidar | Bun.file + fs.watch |

## 🏗️ 迁移步骤

### 阶段 1: 基础架构搭建 ✅
- [x] 初始化 Bun + Elysia 项目
- [x] 配置 Swagger 文档
- [x] 设置路由自动加载
- [x] 安装必要依赖
- [x] 配置环境变量管理

### 阶段 2: 数据库层迁移 ✅
- [x] 迁移 SQLite 数据库操作 (auth.db)
- [x] 实现用户认证数据库操作
- [ ] 迁移项目发现和管理逻辑
- [ ] 实现 Cursor 数据库读取

### 阶段 3: 认证和中间件 ✅
- [x] 实现 JWT 认证中间件
- [x] 实现 API Key 验证
- [x] 实现 WebSocket 认证
- [x] 添加 CORS 和安全中间件

### 阶段 4: 核心 API 路由 ✅
- [x] `/api/auth` - 认证路由
- [x] `/api/projects` - 项目管理
- [x] `/api/projects/:name/sessions` - 会话管理
- [x] `/api/projects/:name/sessions/:id/messages` - 消息获取
- [ ] `/api/cursor` - Cursor CLI 集成
- [ ] `/api/mcp` - MCP 服务器管理
- [ ] `/api/git` - Git 操作
- [ ] 文件操作 API

### 阶段 5: CLI 集成
- [ ] Claude CLI 进程管理
- [ ] Cursor CLI 进程管理
- [ ] 进程生命周期管理
- [ ] 错误处理和日志

### 阶段 6: WebSocket 实现
- [ ] 聊天 WebSocket (/ws)
- [ ] 终端 WebSocket (/shell)
- [ ] 实时项目更新
- [ ] 会话保护机制

### 阶段 7: 文件系统集成
- [ ] 文件树 API
- [ ] 文件读写操作
- [ ] 图像上传处理
- [ ] 静态文件服务

### 阶段 8: 高级功能
- [ ] 文件系统监控
- [ ] 音频转录 (OpenAI Whisper)
- [ ] 会话管理和保护
- [ ] 错误处理和恢复

### 阶段 9: 测试和优化
- [ ] 单元测试
- [ ] 集成测试
- [ ] 性能优化
- [ ] 内存使用优化

### 阶段 10: 部署和文档
- [ ] 生产环境配置
- [ ] Docker 支持
- [ ] API 文档完善
- [ ] 迁移指南

## 📦 依赖包迁移

### 需要安装的 Bun 包
```bash
# 核心框架
bun add elysia

# Elysia 插件
bun add @elysiajs/swagger @elysiajs/cors @elysiajs/jwt @elysiajs/multipart @elysiajs/static

# 数据库
bun add bun:sqlite

# 认证和安全
bun add bcryptjs

# 文件和进程管理
bun add node-pty

# 工具库
bun add mime-types nanoid

# 开发依赖
bun add -d @types/node
```

## 🔄 关键迁移点

### 1. 数据库操作
- 从 `better-sqlite3` 迁移到 `bun:sqlite`
- 保持相同的 SQL 语句和表结构

### 2. 认证系统
- 从 `jsonwebtoken` 迁移到 `@elysiajs/jwt`
- 从 `bcrypt` 迁移到 `Bun.password` 或 `bcryptjs`

### 3. WebSocket 处理
- 从 `ws` 库迁移到 Elysia 内置 WebSocket
- 保持相同的消息协议

### 4. 进程管理
- 从 `child_process` 迁移到 `Bun.spawn`
- 保持 `node-pty` 用于终端模拟

### 5. 文件操作
- 利用 Bun 的原生文件 API
- 从 `multer` 迁移到 `@elysiajs/multipart`

## 🎯 预期收益

### 性能提升
- **启动速度**: Bun 比 Node.js 快 3-4x
- **内存使用**: 减少 30-50%
- **HTTP 性能**: 提升 2-3x
- **WebSocket 性能**: 提升 1.5-2x

### 开发体验
- **TypeScript 原生支持**: 无需编译步骤
- **更好的错误信息**: Bun 提供更清晰的错误堆栈
- **内置工具**: 测试、打包、依赖管理一体化
- **热重载**: 更快的开发反馈

### 维护性
- **更少的依赖**: Bun 内置很多功能
- **统一的工具链**: 减少配置复杂度
- **现代化 API**: 更简洁的代码

## 📝 注意事项

### 兼容性考虑
- 保持 API 接口完全兼容
- 保持数据库结构不变
- 保持 WebSocket 协议不变

### 风险控制
- 分阶段迁移，每个阶段都可以回滚
- 保留原服务器作为备份
- 充分测试每个功能模块

### 测试策略
- 对比测试：新旧服务器并行运行
- 压力测试：验证性能提升
- 功能测试：确保所有功能正常
