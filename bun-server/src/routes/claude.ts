/**
 * CLAUDE CLI ROUTES
 * =================
 * 
 * Routes for Claude CLI integration including spawning processes,
 * session management, and WebSocket communication
 */

import { Elysia, t } from "elysia";
import { authGuard, jwtConfig } from "../middleware/auth.ts";
import { spawnClaude, abortClaudeSession, getActiveClaudeSessions, type ClaudeSpawnOptions } from "../services/claudeCliService.ts";

export default new Elysia()
  .use(jwtConfig)

  // WebSocket endpoint for Claude CLI communication
  .ws("/ws", {
    open(ws) {
      console.log('🔗 Claude WebSocket client connected');
    },

    message(ws, message: any) {
      console.log('📨 Claude WebSocket message received:', message);
      
      try {
        const data = typeof message === 'string' ? JSON.parse(message) : message;
        
        if (data.type === 'claude-command') {
          console.log('💬 User message:', data.command || '[Continue/Resume]');
          console.log('📁 Project:', data.options?.projectPath || 'Unknown');
          console.log('🔄 Session:', data.options?.sessionId ? 'Resume' : 'New');
          
          // Spawn Claude with the provided command and options
          spawnClaude(data.command, data.options as ClaudeSpawnOptions, ws)
            .catch(error => {
              console.error('❌ Error spawning Claude:', error);
              ws.send(JSON.stringify({
                type: 'claude-error',
                error: error.message
              }));
            });
            
        } else if (data.type === 'abort-session') {
          console.log('🛑 Abort session request:', data.sessionId);
          const success = abortClaudeSession(data.sessionId);
          ws.send(JSON.stringify({
            type: 'session-aborted',
            sessionId: data.sessionId,
            provider: 'claude',
            success
          }));
        }
      } catch (error) {
        console.error('❌ Claude WebSocket error:', error);
        ws.send(JSON.stringify({
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        }));
      }
    },

    close(ws) {
      console.log('🔌 Claude WebSocket client disconnected');
    }
  })

  // REST API endpoint to spawn Claude CLI (alternative to WebSocket)
  .post("/spawn", async ({ body, headers, jwt, set }) => {
    const authResult = await authGuard({ jwt, headers, set });
    if (authResult.error) return authResult;

    try {
      const { command, options } = body as {
        command?: string;
        options?: ClaudeSpawnOptions;
      };

      console.log('🚀 REST API: Spawning Claude CLI with command:', command);
      console.log('📋 REST API: Options:', JSON.stringify(options, null, 2));

      // Create a mock WebSocket interface for REST API usage
      const responses: string[] = [];
      const mockWs = {
        send: (data: string) => {
          responses.push(data);
          console.log('📤 Mock WebSocket response:', data);
        },
        readyState: 1,
        OPEN: 1
      };

      await spawnClaude(command, options || {}, mockWs);

      return { 
        success: true, 
        message: 'Claude CLI process completed',
        responses: responses.map(r => JSON.parse(r))
      };

    } catch (error) {
      console.error('❌ Error in Claude spawn REST API:', error);
      set.status = 500;
      return { 
        error: error instanceof Error ? error.message : 'Failed to spawn Claude CLI' 
      };
    }
  }, {
    body: t.Object({
      command: t.Optional(t.String()),
      options: t.Optional(t.Object({
        sessionId: t.Optional(t.String()),
        projectPath: t.Optional(t.String()),
        cwd: t.Optional(t.String()),
        resume: t.Optional(t.Boolean()),
        toolsSettings: t.Optional(t.Object({
          allowedTools: t.Optional(t.Array(t.String())),
          disallowedTools: t.Optional(t.Array(t.String())),
          skipPermissions: t.Optional(t.Boolean())
        })),
        permissionMode: t.Optional(t.Union([
          t.Literal('default'),
          t.Literal('plan')
        ])),
        images: t.Optional(t.Array(t.Object({
          name: t.String(),
          data: t.String(),
          size: t.Number(),
          mimeType: t.String()
        }))),
        env: t.Optional(t.Record(t.String(), t.String()))
      }))
    }),
    detail: {
      tags: ["Claude"],
      summary: "Spawn Claude CLI Process (REST API)",
      description: "Spawn a Claude CLI process with the given command and options. This is an alternative to the WebSocket interface."
    }
  })

  // Abort Claude session endpoint
  .post("/abort/:sessionId", async ({ params, headers, jwt, set }) => {
    const authResult = await authGuard({ jwt, headers, set });
    if (authResult.error) return authResult;

    try {
      const { sessionId } = params;
      
      console.log('🛑 REST API: Abort Claude session:', sessionId);
      const success = abortClaudeSession(sessionId);

      if (success) {
        return { 
          success: true, 
          message: `Claude session ${sessionId} aborted successfully` 
        };
      } else {
        set.status = 404;
        return { 
          error: `Claude session ${sessionId} not found or already terminated` 
        };
      }

    } catch (error) {
      console.error('❌ Error aborting Claude session:', error);
      set.status = 500;
      return { 
        error: error instanceof Error ? error.message : 'Failed to abort Claude session' 
      };
    }
  }, {
    params: t.Object({
      sessionId: t.String()
    }),
    detail: {
      tags: ["Claude"],
      summary: "Abort Claude Session",
      description: "Abort an active Claude CLI session by session ID"
    }
  })

  // Get active Claude sessions (for debugging/monitoring)
  .get("/sessions", async ({ headers, jwt, set }) => {
    const authResult = await authGuard({ jwt, headers, set });
    if (authResult.error) return authResult;

    try {
      const sessionsInfo = getActiveClaudeSessions();
      return sessionsInfo;

    } catch (error) {
      console.error('❌ Error getting Claude sessions:', error);
      set.status = 500;
      return { 
        error: error instanceof Error ? error.message : 'Failed to get Claude sessions' 
      };
    }
  }, {
    detail: {
      tags: ["Claude"],
      summary: "Get Active Claude Sessions",
      description: "Get information about active Claude CLI sessions including session IDs and process status"
    }
  });