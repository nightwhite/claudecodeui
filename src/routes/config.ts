import { Elysia } from "elysia";

export default new Elysia()
  .get("/", async ({ headers, request }) => {
    const url = new URL(request.url);
    const host = headers.host || `${url.hostname}:${url.port || 3000}`;
    const protocol = url.protocol === 'https:' ? 'wss' : 'ws';

    return {
      serverPort: url.port || 3000,
      wsUrl: `${protocol}://${host}`
    }
  }, {
    detail: {
      tags: ["General"],
      summary: "Get Server Configuration",
      description: "Get server configuration including WebSocket URL"
    }
  });
