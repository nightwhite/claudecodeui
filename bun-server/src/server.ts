import { Elysia } from "elysia"
import { config } from "./config.ts"
import { swagger } from "@elysiajs/swagger"
import { cors } from "@elysiajs/cors"
import { autoload } from "elysia-autoload"

import { setupProjectsWatcher } from "./services/projectWatcherService.ts"

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
            { name: 'Transcription', description: 'Audio transcription endpoints' },
            { name: 'WebSocket', description: 'WebSocket endpoints for real-time communication' }
        ]
    }
}))
.use(cors())
.use(await autoload({
    dir: "./routes",
    prefix: "/api",
    ignore: ["**/*.test.ts", "**/*.spec.ts"]
}))
.get("/", () => "Claude Code UI - Bun Server", {
    detail: {
        tags: ["General"],
        summary: "Welcome Message",
        description: "Returns welcome message for Claude Code UI"
    }
})

export type ElysiaApp = typeof app