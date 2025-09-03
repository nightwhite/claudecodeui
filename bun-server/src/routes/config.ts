import { Elysia } from "elysia";
import { authGuard, jwtConfig } from "../middleware/auth.ts";

export default new Elysia()
  .use(jwtConfig)
  .get("/", async ({ headers, jwt, set, request }) => {
    const authResult = await authGuard({ jwt, headers, set });
    if (authResult.error) return authResult;

    try {
      const url = new URL(request.url);
      const host = headers.host || `${url.hostname}:${url.port || 3000}`;
      const protocol = url.protocol === 'https:' ? 'wss' : 'ws';

      console.log('Config API called - Returning host:', host, 'Protocol:', protocol);

      return {
        serverPort: url.port || 3000,
        wsUrl: `${protocol}://${host}`
      };
    } catch (error) {
      console.error('Error in config endpoint:', error);
      set.status = 500;
      return { error: 'Failed to get server config' };
    }
  }, {
    detail: {
      tags: ["General"],
      summary: "Get Server Configuration",
      description: "Get server configuration including WebSocket URL"
    }
  });
