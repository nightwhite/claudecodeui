import { Elysia } from "elysia"
import { config } from "./config.ts"
import { swagger } from "@elysiajs/swagger"
import { cors } from "@elysiajs/cors"
import { autoload } from "elysia-autoload"

import { initializeDatabase } from "./database/db.ts"
import { jwtConfig, validateApiKey } from "./middleware/auth.ts"
import { setupProjectsWatcher } from "./services/projectWatcherService.ts"

// Initialize database on startup (includes Claude environment variables)
await initializeDatabase();

// Setup projects watcher on startup
await setupProjectsWatcher();

export const app = new Elysia()
.state('config', config)
.use(jwtConfig)
.use(swagger({
    path: "/swagger",
    documentation: {
        info: {
            title: 'Claude Code UI API',
            version: '2.0.0',
            description: 'Bun + Elysia version of Claude Code UI server'
        },
        tags: [
            { name: 'Authentication', description: 'User authentication endpoints' },
            { name: 'Health', description: 'Health check endpoints' },
            { name: 'Projects', description: 'Project management endpoints (relative paths only)' },
            { name: 'System Files', description: 'System file operations (absolute paths only)' },
            { name: 'Claude', description: 'Claude CLI integration endpoints' },
            { name: 'Claude Environment', description: 'Isolated Claude CLI environment variables' },
            { name: 'Transcription', description: 'Audio transcription endpoints' },
            { name: 'WebSocket', description: 'WebSocket endpoints for real-time communication' }
        ],
        components: {
            securitySchemes: {
                BearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'Enter your JWT token'
                },
                ApiKeyAuth: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'x-api-key',
                    description: 'API Key for additional security'
                }
            }
        },
        security: [
            { BearerAuth: [] },
            { ApiKeyAuth: [] }
        ]
    }
}))
.use(cors())
// Optional API key validation middleware
.derive(({ headers, set, request }) => {
    // Apply API key validation to all /api routes
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api')) {
        const result = validateApiKey({ headers, set });
        if (result) return result;
    }
})
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