# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

XCoding CLI 是一个用于 Claude Code CLI 的 Web 服务器，基于 Bun + Elysia 架构，通过 WebSocket 进行实时通信。

## 常用命令

### 开发环境
```bash
# 启动开发服务器
bun run dev

# 启动生产服务器
bun run start
```

### 构建和部署
```bash
# 构建当前平台二进制
bun run build

# 构建所有平台
bun run build:all

# 单独构建特定平台
bun run build:linux
bun run build:macos
bun run build:macos-arm
bun run build:windows
```

### 依赖管理
```bash
# 安装依赖
bun install
```

## 核心架构

### 技术栈
- **Runtime**: Bun - 高性能 JavaScript 运行时
- **Web Framework**: ElysiaJS - 超快速的 TypeScript Web 框架
- **WebSocket**: 原生 Bun WebSocket - 实时通信
- **文件监听**: chokidar - 项目文件变更监听

### 目录结构
```
├── src/                 # React 前端源码
│   ├── components/      # React 组件
│   ├── contexts/        # React Context (主题、认证)
│   ├── hooks/          # 自定义 React Hooks
│   ├── utils/          # 工具函数 (API、WebSocket、Whisper)
│   └── lib/            # 共享库文件
├── server/             # Node.js 后端源码
│   ├── routes/         # API 路由 (auth、git、mcp、cursor)
│   ├── database/       # SQLite 数据库配置
│   ├── middleware/     # 中间件 (认证)
│   ├── claude-cli.js   # Claude CLI 集成
│   ├── cursor-cli.js   # Cursor CLI 集成
│   └── projects.js     # 项目发现和管理系统
├── public/             # 静态资源和 PWA 文件
└── bun-server/         # Bun.js 服务器实现 (实验性)
```

### 项目发现系统

项目支持双 CLI 集成：

1. **Claude 项目** (`~/.claude/projects/`)
   - 项目目录名为编码后的路径 (/ 替换为 -)
   - 使用 .jsonl 文件存储会话历史
   - 从 'cwd' 字段提取实际项目路径

2. **Cursor 项目** (`~/.cursor/chats/`)
   - 使用项目绝对路径的 MD5 哈希命名目录
   - SQLite 数据库存储会话数据 (store.db)
   - 需要已知项目路径才能发现对应的 Cursor 会话

### WebSocket 通信架构

- **会话保护系统**: 在活跃对话期间暂停项目更新，避免界面刷新干扰
- **多路复用**: 同时支持 Claude 和 Cursor CLI 的 WebSocket 连接
- **实时同步**: 项目列表、文件变更、Git 状态的实时更新

### 认证系统

- 基于 JWT 的认证机制
- SQLite 数据库存储用户凭据
- WebSocket 连接认证保护
- 支持 API 密钥验证

## 环境配置

### 必需环境变量
```bash
# 后端服务器端口
PORT=3001

# 前端开发服务器端口  
VITE_PORT=5173
```

### 先决条件
- Node.js v20 或更高版本
- Claude Code CLI 已安装并配置，和/或
- Cursor CLI 已安装并配置

## 开发注意事项

### CLI 集成
- 项目自动发现 Claude 和 Cursor 项目
- 通过进程管理与 CLI 工具交互
- 支持工具权限控制和会话恢复

### 响应式设计
- 移动优先设计，支持触摸手势
- PWA 支持，可添加到主屏幕
- 底部导航栏适配移动设备

### 实时功能
- 文件系统监听 (chokidar)
- Git 状态实时更新
- 终端会话持久化

### 安全特性
- 默认禁用所有 Claude Code 工具
- 用户需手动启用所需功能
- 文件访问权限控制

## 文件系统集成

- 交互式文件树浏览器
- 实时文件编辑和保存
- 语法高亮支持多种编程语言
- 文件上传和下载功能

## 音频功能 (实验性)

- 内置语音录制 (useAudioRecorder hook)
- Whisper API 集成用于语音转文本
- 支持音频消息发送

## MCP (Model Context Protocol) 支持

- 通过 UI 添加和管理 MCP 服务器
- 动态配置更新
- 与 Claude CLI 的 MCP 集成

## Bun Server 迁移状态

项目正在从 Node.js + Express 迁移到 Bun + Elysia 架构。**核心功能已完成迁移**，但仍有部分扩展功能未实现。

### ✅ 已完成迁移的模块

1. **基础架构** - Elysia 服务器、JWT 认证、SQLite 数据库
2. **认证系统** (`auth`) - 用户注册/登录、JWT token 管理、认证中间件
3. **项目管理** (`projects`) - **完整迁移** ✅
   - 项目发现和列表 (Claude 和 Cursor 项目)
   - 会话管理 (列表、消息、删除)
   - 项目操作 (重命名、删除、创建)
   - 文件操作 (读取、保存、文件树、二进制文件)
   - 图片上传功能
4. **Claude CLI 集成** (`claude`) - **完整迁移** ✅
   - WebSocket 实时通信 (`WS /api/claude/ws`)
   - 进程管理和会话控制
   - 工具权限配置
   - 图片处理和临时文件管理
   - MCP 配置检测
   - 环境变量独立管理 (`claudeEnv`)
5. **系统文件操作** (`files`) - **完整迁移** ✅
   - 绝对路径文件读写
   - 二进制文件服务
6. **音频转录** (`transcribe`) - **完整迁移** ✅
   - Whisper API 集成
   - GPT-4o-mini 增强模式 (prompt/vibe/instructions)
7. **WebSocket 主服务** (`websocket`) - **完整迁移** ✅
   - 实时项目更新推送
   - chokidar 文件系统监听
   - Claude 命令路由

### ⚠️ 未迁移的功能 (根据你的需求可能需要)

1. **Shell Terminal WebSocket** - 未实现
   - 原路径: `server/index.js` 中的 `/shell` WebSocket
   - 功能: node-pty 交互式终端、实时输出、URL 检测
   - **影响**: 前端无法使用内置终端功能

2. **Cursor CLI 集成** - 未迁移
   - 原文件: `server/cursor-cli.js` 和 `server/routes/cursor.js`
   - 功能: Cursor Agent 进程管理、命令执行
   - **影响**: 无法使用 Cursor CLI 功能

3. **Git 操作 API** - 未迁移
   - 原文件: `server/routes/git.js`
   - 功能: git status/diff/log/commit/push 等
   - **影响**: 前端无法进行 Git 操作

4. **MCP 服务器管理 UI** - 未迁移
   - 原文件: `server/routes/mcp.js`
   - 功能: MCP 配置的增删改查
   - **影响**: 只能手动编辑 `~/.claude.json`

5. **TaskMaster 功能** - 未迁移
   - 原文件: `server/routes/taskmaster.js`
   - 功能: 任务管理相关功能

6. **静态文件服务** - 未实现
   - 原代码: `app.use(express.static(path.join(__dirname, '../dist')))`
   - **影响**: 生产环境无法直接访问前端页面

### 🎯 完成度评估

```txt
总体核心功能: ████████░░ 85% 完成

✅ 认证系统:     100%
✅ 项目管理:     100%
✅ Claude CLI:   100%
✅ 文件操作:     100%
✅ 音频转录:     100%
✅ WebSocket:    100% (项目监听) / 0% (终端)
❌ Cursor:       0%
❌ Git API:      0%
❌ MCP UI:       0%
❌ 静态文件:     0%
```

### 📝 迁移建议

根据你的目标"**完全迁移 Claude Code 部分**"，当前状态已经基本达成:

- ✅ **Claude CLI 核心功能** - 完全迁移
- ✅ **项目和会话管理** - 完全迁移
- ✅ **文件操作** - 完全迁移
- ⚠️ **Shell 终端** - 如需要交互式终端体验,需要迁移
- ❌ **Cursor 相关** - 你已标记为"不需要"
- ❌ **Git/MCP** - 非核心功能,可选迁移

### Bun Server 命令

```bash
# 开发模式
cd bun-server && bun run dev

# 生产模式
cd bun-server && bun run start
```
