/**
 * CLAUDE ENVIRONMENT VARIABLES ROUTES
 * ===================================
 * 
 * Routes for managing isolated Claude CLI environment variables
 */

import { Elysia, t } from "elysia";
import { authGuard, jwtConfig } from "../middleware/auth.ts";
import { 
  getAllClaudeEnvVars, 
  getClaudeEnvVar, 
  setClaudeEnvVar, 
  deleteClaudeEnvVar,
  bulkUpdateClaudeEnvVars 
} from "../database/claudeEnv.ts";

export default new Elysia()
  .use(jwtConfig)

  // Get all Claude environment variables
  .get("/", async ({ headers, jwt, set }) => {
    const authResult = await authGuard({ jwt, headers, set });
    if (authResult.error) return authResult;

    try {
      const envVars = getAllClaudeEnvVars();
      
      // Mask sensitive values in the response
      const maskedEnvVars = envVars.map(env => ({
        ...env,
        value: env.key.includes('TOKEN') || env.key.includes('KEY') || env.key.includes('SECRET')
          ? (env.value ? '***HIDDEN***' : '')
          : env.value
      }));

      return { envVars: maskedEnvVars };
    } catch (error) {
      console.error('❌ Error getting Claude env vars:', error);
      set.status = 500;
      return { error: 'Failed to get environment variables' };
    }
  }, {
    detail: {
      tags: ["Claude Environment"],
      summary: "Get All Claude Environment Variables",
      description: "Get all isolated Claude CLI environment variables (sensitive values are masked)"
    }
  })

  // Get specific Claude environment variable
  .get("/:key", async ({ params, headers, jwt, set }) => {
    const authResult = await authGuard({ jwt, headers, set });
    if (authResult.error) return authResult;

    try {
      const { key } = params;
      const envVar = getClaudeEnvVar(key);
      
      if (!envVar) {
        set.status = 404;
        return { error: 'Environment variable not found' };
      }

      // Mask sensitive value
      const maskedEnvVar = {
        ...envVar,
        value: envVar.key.includes('TOKEN') || envVar.key.includes('KEY') || envVar.key.includes('SECRET')
          ? (envVar.value ? '***HIDDEN***' : '')
          : envVar.value
      };

      return { envVar: maskedEnvVar };
    } catch (error) {
      console.error('❌ Error getting Claude env var:', error);
      set.status = 500;
      return { error: 'Failed to get environment variable' };
    }
  }, {
    params: t.Object({
      key: t.String()
    }),
    detail: {
      tags: ["Claude Environment"],
      summary: "Get Specific Claude Environment Variable",
      description: "Get a specific Claude CLI environment variable by key (sensitive values are masked)"
    }
  })

  // Set Claude environment variable
  .put("/:key", async ({ params, body, headers, jwt, set }) => {
    const authResult = await authGuard({ jwt, headers, set });
    if (authResult.error) return authResult;

    try {
      const { key } = params;
      const { value, description } = body as { value: string; description?: string };

      if (typeof value !== 'string') {
        set.status = 400;
        return { error: 'Value must be a string' };
      }

      const success = setClaudeEnvVar(key, value, description);
      
      if (success) {
        console.log(`✅ Set Claude env var: ${key}`);
        return { success: true, message: `Environment variable '${key}' updated` };
      } else {
        set.status = 500;
        return { error: 'Failed to set environment variable' };
      }
    } catch (error) {
      console.error('❌ Error setting Claude env var:', error);
      set.status = 500;
      return { error: 'Failed to set environment variable' };
    }
  }, {
    params: t.Object({
      key: t.String()
    }),
    body: t.Object({
      value: t.String(),
      description: t.Optional(t.String())
    }),
    detail: {
      tags: ["Claude Environment"],
      summary: "Set Claude Environment Variable",
      description: "Set or update a Claude CLI environment variable"
    }
  })

  // Delete Claude environment variable
  .delete("/:key", async ({ params, headers, jwt, set }) => {
    const authResult = await authGuard({ jwt, headers, set });
    if (authResult.error) return authResult;

    try {
      const { key } = params;
      
      const success = deleteClaudeEnvVar(key);
      
      if (success) {
        console.log(`🗑️ Deleted Claude env var: ${key}`);
        return { success: true, message: `Environment variable '${key}' deleted` };
      } else {
        set.status = 404;
        return { error: 'Environment variable not found' };
      }
    } catch (error) {
      console.error('❌ Error deleting Claude env var:', error);
      set.status = 500;
      return { error: 'Failed to delete environment variable' };
    }
  }, {
    params: t.Object({
      key: t.String()
    }),
    detail: {
      tags: ["Claude Environment"],
      summary: "Delete Claude Environment Variable",
      description: "Delete a Claude CLI environment variable"
    }
  })

  // Bulk update Claude environment variables
  .post("/bulk", async ({ body, headers, jwt, set }) => {
    const authResult = await authGuard({ jwt, headers, set });
    if (authResult.error) return authResult;

    try {
      const { envVars } = body as { envVars: Record<string, string> };

      if (!envVars || typeof envVars !== 'object') {
        set.status = 400;
        return { error: 'envVars must be an object' };
      }

      const success = bulkUpdateClaudeEnvVars(envVars);
      
      if (success) {
        const keys = Object.keys(envVars);
        console.log(`✅ Bulk updated Claude env vars: ${keys.join(', ')}`);
        return { 
          success: true, 
          message: `Updated ${keys.length} environment variables`,
          keys 
        };
      } else {
        set.status = 500;
        return { error: 'Failed to bulk update environment variables' };
      }
    } catch (error) {
      console.error('❌ Error bulk updating Claude env vars:', error);
      set.status = 500;
      return { error: 'Failed to bulk update environment variables' };
    }
  }, {
    body: t.Object({
      envVars: t.Record(t.String(), t.String())
    }),
    detail: {
      tags: ["Claude Environment"],
      summary: "Bulk Update Claude Environment Variables",
      description: `Update multiple Claude CLI environment variables at once.

Example request body:
\`\`\`json
{
  "envVars": {
    "ANTHROPIC_AUTH_TOKEN": "sk-ant-api03-...",
    "ANTHROPIC_BASE_URL": "https://api.anthropic.com",
    "ANTHROPIC_MODEL": "claude-3-5-sonnet@20241022"
  }
}
\`\`\`

All provided variables will be created or updated. Existing variables not included in the request will remain unchanged.`,
      examples: {
        "Basic Usage": {
          value: {
            envVars: {
              "ANTHROPIC_AUTH_TOKEN": "sk-ant-api03-your-token-here",
              "ANTHROPIC_BASE_URL": "https://api.anthropic.com",
              "ANTHROPIC_MODEL": "claude-3-5-sonnet@20241022"
            }
          }
        }
      }
    }
  });