import { Elysia } from "elysia"
import { config } from "./config.ts"
import { swagger } from "@elysiajs/swagger"
import { cors } from "@elysiajs/cors"
import { staticPlugin } from "@elysiajs/static"
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

import { setupProjectsWatcher } from "./services/projectWatcherService.ts"

// Import routes manually (for binary compatibility)
import claudeRoutes from "./routes/claude.ts"
import claudeEnvRoutes from "./routes/claudeEnv.ts"
import filesRoutes from "./routes/files.ts"
import mcpRoutes from "./routes/mcp.ts"
import projectsRoutes from "./routes/projects.ts"
import websocketRoutes from "./routes/websocket.ts"

// Get the directory of the current file
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Determine base directory (for compiled binary vs source)
const isBinary = import.meta.url.includes('/$bunfs/')
const baseDir = isBinary ? process.cwd() : join(__dirname, '..')

// Setup projects watcher on startup
await setupProjectsWatcher();

export const app = new Elysia()
.state('config', config)
.use(swagger({
    path: "/swagger",
    exclude: ["/swagger", "/swagger/json"],
    documentation: {
        openapi: "3.0.3",
        info: {
            title: 'Claude Code UI API',
            version: '2.0.0',
            description: 'Bun + Elysia version of Claude Code UI server'
        },
        tags: [
            { name: 'Health', description: 'Health check endpoints' },
            { name: 'Projects', description: 'Project management endpoints (relative paths only)' },
            { name: 'System Files', description: 'System file operations (absolute paths only)' },
            { name: 'Claude', description: 'Claude CLI integration endpoints' },
            { name: 'Claude Environment', description: 'Isolated Claude CLI environment variables' },
            { name: 'MCP', description: 'Model Context Protocol server configurations' },
            { name: 'WebSocket', description: 'WebSocket endpoints for real-time communication' }
        ]
    }
}))
.use(cors())
.use(staticPlugin({
    assets: join(baseDir, "client"),
    prefix: "/",
}))
// Mount routes manually (for binary compatibility)
.group("/api/claude", app => app.use(claudeRoutes))
.group("/api/claudeEnv", app => app.use(claudeEnvRoutes))
.group("/api/files", app => app.use(filesRoutes))
.group("/api/mcp", app => app.use(mcpRoutes))
.group("/api/projects", app => app.use(projectsRoutes))
.group("/api/ws", app => app.use(websocketRoutes))
.get("/", () => Bun.file(join(baseDir, "client/index.html")), {
    detail: {
        tags: ["General"],
        summary: "Client Application",
        description: "Serves the HTML client application"
    }
})

export type ElysiaApp = typeof app