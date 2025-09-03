/**
 * WEBSOCKET ROUTES
 * ================
 * 
 * Main WebSocket routes for chat and project monitoring
 */

import { Elysia } from "elysia";
import { jwtConfig, authenticateWebSocket } from "../middleware/auth.ts";
import { spawnClaude, abortClaudeSession, type ClaudeSpawnOptions } from "../services/claudeCliService.ts";
import { addProjectWatcherClient, removeProjectWatcherClient } from "../services/projectWatcherService.ts";

export default new Elysia()
  .use(jwtConfig)

  // Main chat WebSocket endpoint - handles both Claude commands and project updates
  .ws("/ws", {
    open(ws) {
      console.log('🔗 Chat WebSocket client connected');
      
      // Add client to project watcher with a unique identifier
      (ws as any).__watcherClient = {
        send: (data: string) => {
          if (ws.readyState === 1) {
            ws.send(data);
          }
        },
        readyState: ws.readyState,
        OPEN: 1
      };
      addProjectWatcherClient((ws as any).__watcherClient);
    },

    message(ws, message: any) {
      console.log('📨 Chat WebSocket message received:', message);
      
      try {
        const data = typeof message === 'string' ? JSON.parse(message) : message;
        
        if (data.type === 'claude-command') {
          console.log('💬 User message:', data.command || '[Continue/Resume]');
          console.log('📁 Project:', data.options?.projectPath || 'Unknown');
          console.log('🔄 Session:', data.options?.sessionId ? 'Resume' : 'New');
          
          // Create WebSocket interface for Claude CLI
          const wsInterface = {
            send: (data: string) => ws.send(data),
            readyState: 1,
            OPEN: 1
          };
          
          // Spawn Claude with the provided command and options
          spawnClaude(data.command, data.options as ClaudeSpawnOptions, wsInterface)
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
        console.error('❌ Chat WebSocket error:', error);
        ws.send(JSON.stringify({
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        }));
      }
    },

    close(ws) {
      console.log('🔌 Chat WebSocket client disconnected');
      
      // Remove client from project watcher
      if ((ws as any).__watcherClient) {
        removeProjectWatcherClient((ws as any).__watcherClient);
      }
    }
  })

  // Health check endpoint for WebSocket
  .get("/ws/status", async ({ set }) => {
    try {
      // Optional: Add auth check if needed
      // const authResult = await authGuard({ jwt, headers, set });
      // if (authResult.error) return authResult;

      const { getWatcherStatus } = await import("../services/projectWatcherService.ts");
      const status = getWatcherStatus();
      
      return {
        websocket: "active",
        projectWatcher: status
      };
    } catch (error) {
      set.status = 500;
      return { 
        error: "Failed to get WebSocket status",
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }, {
    detail: {
      tags: ["WebSocket"],
      summary: "Get WebSocket Status",
      description: "Get current WebSocket and project watcher status"
    }
  });