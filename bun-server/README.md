# Claude Code UI - Bun Server

基于 Bun + Elysia 的高性能 Claude Code CLI Web 服务器。

## 技术栈

- **Runtime**: [Bun](https://bun.sh/) - 高性能 JavaScript 运行时
- **Web Framework**: [ElysiaJS](https://elysiajs.com/) - 超快速的 TypeScript Web 框架
- **Database**: SQLite3 - 轻量级数据库
- **WebSocket**: 原生 Bun WebSocket - 实时通信
- **Plugins**: [CORS](https://elysiajs.com/plugins/cors.html), [JWT](https://elysiajs.com/plugins/jwt.html), [Static](https://elysiajs.com/plugins/static.html)

## 快速开始

### 开发模式

```bash
cd bun-server
bun install

# 创建本地开发配置（首次运行）
cp .env.example .env

# 启动开发服务器（自动加载 .env 文件）
bun run dev

# 或使用自定义配置文件
bun run dev -- --env custom.env

# 或直接指定端口
bun run dev -- --port 8080
```

### 生产模式

```bash
# 自动加载 .env 文件
bun run start

# 或使用自定义配置
bun run start -- --env production.env
```

## 二进制打包和部署

### 打包命令

#### 本地平台打包

```bash
cd bun-server
bun run build
```

生成文件位置：`build/claudecodeui` (macOS/Linux) 或 `build/claudecodeui.exe` (Windows)
同时会复制 `.env.example` 到 `build/` 目录

#### 跨平台打包

```bash
# Linux x64
bun run build:linux

# macOS Intel
bun run build:macos

# macOS Apple Silicon (M1/M2/M3)
bun run build:macos-arm

# Windows x64
bun run build:windows

# 一次性打包所有平台
bun run build:all
```

### 运行方式

#### 方式 1: 使用 .env 文件（推荐）

```bash
# 创建配置文件
cp .env.example production.env

# 编辑配置
vim production.env

# 运行（会自动读取 .env 文件）
./claudecodeui
```

#### 方式 2: 使用自定义 .env 文件

```bash
# 使用 --env 参数指定配置文件
./claudecodeui --env my-config.env

# 或使用简写
./claudecodeui -e my-config.env
```

#### 方式 3: 使用 JSON 配置文件

```bash
# 创建 JSON 配置（参考 .env.example 格式）
cat > production.config.json << 'EOF'
{
  "PORT": 3000,
  "NODE_ENV": "production",
  "ANTHROPIC_API_KEY": "sk-ant-xxxxx"
}
EOF

# 运行
./claudecodeui --env production.config.json
```

#### 方式 4: 指定端口

```bash
# 覆盖配置文件中的端口
./claudecodeui --env my-config.env --port 8080

# 或使用简写
./claudecodeui -e my-config.env -p 8080
```

#### 方式 5: 组合使用

```bash
# 不使用配置文件，直接指定端口
./claudecodeui --port 3000

# 使用环境变量 + 配置文件
ANTHROPIC_API_KEY=sk-ant-xxx ./claudecodeui --env production.env
```

## 配置文件格式

### .env 格式（推荐）

```env
PORT=3000
NODE_ENV=production
ANTHROPIC_API_KEY=sk-ant-xxxxx
CLAUDE_APPEND_SYSTEM_PROMPT=每次执行都需要先规划再去执行
```

### JSON 格式

```json
{
  "PORT": 3000,
  "NODE_ENV": "production",
  "ANTHROPIC_API_KEY": "sk-ant-xxxxx",
  "CLAUDE_APPEND_SYSTEM_PROMPT": "每次执行都需要先规划再去执行"
}
```

### JavaScript/TypeScript 格式

```js
// config.js
module.exports = {
  PORT: 3000,
  NODE_ENV: "production",
  ANTHROPIC_API_KEY: "sk-ant-xxxxx",
  CLAUDE_APPEND_SYSTEM_PROMPT: "每次执行都需要先规划再去执行"
};
```

使用: `./claudecodeui --env config.js`

## 部署示例

### Linux 服务器部署

```bash
# 1. 上传二进制文件和配置
scp claudecodeui-linux user@server:/opt/claudecodeui/
scp production.env user@server:/opt/claudecodeui/

# 2. SSH 到服务器
ssh user@server

# 3. 添加执行权限
chmod +x /opt/claudecodeui/claudecodeui-linux

# 4. 运行
cd /opt/claudecodeui
./claudecodeui-linux --env production.env
```

### 使用 systemd 服务

创建 `/etc/systemd/system/claudecodeui.service`:

```ini
[Unit]
Description=Claude Code UI Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/claudecodeui
ExecStart=/opt/claudecodeui/claudecodeui-linux --env production.env
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启动服务:

```bash
sudo systemctl daemon-reload
sudo systemctl enable claudecodeui
sudo systemctl start claudecodeui
sudo systemctl status claudecodeui
```

### Docker 部署

```dockerfile
FROM debian:bookworm-slim

WORKDIR /app

# 复制二进制文件和配置
COPY claudecodeui-linux /app/claudecodeui
COPY production.env /app/production.env
COPY client /app/client

# 添加执行权限
RUN chmod +x /app/claudecodeui

# 暴露端口
EXPOSE 3000

# 启动
CMD ["/app/claudecodeui", "--env", "production.env"]
```

构建和运行:

```bash
docker build -t claudecodeui .
docker run -p 3000:3000 -v $(pwd)/data:/app/data claudecodeui
```

## 环境变量加载机制

服务器启动时会按以下优先级加载配置（后加载的会覆盖先加载的）：

1. **默认 .env 文件** - 如果存在 `.env` 文件，自动加载
2. **自定义配置文件** - 如果指定了 `--env` 参数，覆盖默认配置
3. **命令行参数** - `--port` 参数拥有最高优先级

### 使用示例

```bash
# 1. 只使用 .env 文件
bun run dev

# 2. 使用自定义配置文件（会覆盖 .env）
bun run dev -- --env production.env

# 3. 使用 .env + 端口覆盖
bun run dev -- --port 8080

# 4. 自定义配置 + 端口覆盖
bun run dev -- --env custom.env --port 8080
```

## 注意事项

### 1. 静态资源

二进制打包**不包含** `client` 目录，需要手动复制：

```bash
# 确保 client 目录在二进制文件同级目录
./claudecodeui
├── client/
│   ├── index.html
│   ├── app.js
│   └── style.css
└── production.env
```

### 2. 数据库路径

配置文件中的相对路径是相对于**运行目录**：

```env
# 推荐使用绝对路径
DB_PATH=/opt/claudecodeui/data/auth.db

# 或相对路径（相对于运行目录）
DB_PATH=./data/auth.db
```

### 3. 文件权限

Linux/macOS 需要添加执行权限：

```bash
chmod +x claudecodeui
```

### 4. 跨平台兼容性

- Linux 二进制在 macOS 上无法运行，反之亦然
- Windows 二进制需要 `.exe` 扩展名
- 建议在目标平台上打包，或使用交叉编译

## 故障排查

### 问题 1: 找不到配置文件

```
❌ Failed to load config file: Config file not found: /path/to/config.env
```

**解决**: 使用绝对路径或确保配置文件在正确位置

```bash
./claudecodeui --env /absolute/path/to/config.env
```

### 问题 2: 端口被占用

```
Error: listen EADDRINUSE: address already in use :::3000
```

**解决**: 更换端口

```bash
./claudecodeui --env config.env --port 3001
```

### 问题 3: 找不到 client 目录

```
404 Not Found
```

**解决**: 确保 `client` 目录存在

```bash
cp -r client ./
./claudecodeui --env config.env
```

### 问题 4: 权限问题 (Linux/macOS)

```
bash: ./claudecodeui: Permission denied
```

**解决**: 添加执行权限

```bash
chmod +x claudecodeui
```

## 测试

```bash
# 测试打包
cd bun-server
bun run build

# 创建测试配置
cat > test.env << EOF
PORT=3000
NODE_ENV=development
EOF

# 测试运行
./claudecodeui --env test.env

# 访问测试
curl http://localhost:3000
```