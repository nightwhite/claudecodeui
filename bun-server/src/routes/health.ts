import { Elysia } from "elysia";

export default new Elysia()
  .get("/", () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: "2.0.0",
    runtime: "Bun",
    framework: "Elysia"
  }), {
    detail: {
      tags: ["Health"],
      summary: "Health Check",
      description: "Returns the health status of the server",
      responses: {
        200: {
          description: "Server is healthy",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  status: {
                    type: "string",
                    example: "ok",
                    description: "Health status"
                  },
                  timestamp: {
                    type: "string",
                    format: "date-time",
                    description: "Current server timestamp"
                  },
                  uptime: {
                    type: "number",
                    description: "Server uptime in seconds"
                  },
                  version: {
                    type: "string",
                    example: "2.0.0",
                    description: "API version"
                  },
                  runtime: {
                    type: "string",
                    example: "Bun",
                    description: "JavaScript runtime"
                  },
                  framework: {
                    type: "string",
                    example: "Elysia",
                    description: "Web framework"
                  }
                }
              }
            }
          }
        }
      }
    }
  })