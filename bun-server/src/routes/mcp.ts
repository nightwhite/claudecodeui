/**
 * MCP CONFIGURATION ROUTES
 * ========================
 *
 * Routes for managing MCP server configurations
 */

import { Elysia, t } from "elysia";
import {
  getAllMCPServers,
  getMCPServer,
  setMCPServer,
  deleteMCPServer,
  getMCPConfigJSON,
  hasMCPServers,
  clearAllMCPServers,
  bulkImportMCPServers
} from "../services/mcpConfigService.ts";

export default new Elysia()

  // Get all MCP servers
  .get("/", async ({ set }) => {
    try {
      const servers = getAllMCPServers();

      return {
        servers,
        count: servers.length,
        hasServers: hasMCPServers()
      };
    } catch (error) {
      console.error('❌ Error getting MCP servers:', error);
      set.status = 500;
      return { error: 'Failed to get MCP servers' };
    }
  }, {
    detail: {
      tags: ["MCP"],
      summary: "Get All MCP Servers",
      description: "Get all configured MCP servers"
    }
  })

  // Get specific MCP server
  .get("/:name", async ({ params, set }) => {
    try {
      const { name } = params;
      const server = getMCPServer(name);

      if (!server) {
        set.status = 404;
        return { error: 'MCP server not found' };
      }

      return { server };
    } catch (error) {
      console.error('❌ Error getting MCP server:', error);
      set.status = 500;
      return { error: 'Failed to get MCP server' };
    }
  }, {
    params: t.Object({
      name: t.String()
    }),
    detail: {
      tags: ["MCP"],
      summary: "Get Specific MCP Server",
      description: "Get a specific MCP server by name"
    }
  })

  // Add/Update MCP server (Smart format detection)
  .post("/add", async ({ body, query, set }) => {
    try {
      const { scope = 'user', projectPath } = query as { scope?: 'user' | 'local'; projectPath?: string };
      let rawBody = body as any;

      // Smart format detection and parsing
      let config: any;
      let name: string | undefined = undefined;

      // Format 1: { "mcpServers": { "name": { config } } }
      if (rawBody.mcpServers && typeof rawBody.mcpServers === 'object') {
        const servers = Object.keys(rawBody.mcpServers);
        if (servers.length === 0) {
          set.status = 400;
          return { error: 'No servers found in mcpServers object' };
        }
        // Use first server if multiple provided
        name = servers[0];
        if (name) {
          config = rawBody.mcpServers[name];
          console.log(`📦 Detected format: { mcpServers: { "${name}": {...} } }`);
        }
      }
      // Format 2: { "name": { config } } (single key-value)
      else if (typeof rawBody === 'object' && !rawBody.command && !rawBody.url && !rawBody.type) {
        const keys = Object.keys(rawBody);
        if (keys.length === 1) {
          name = keys[0];
          if (name) {
            config = rawBody[name];
            console.log(`📦 Detected format: { "${name}": {...} }`);
          }
        } else if (keys.length === 0) {
          set.status = 400;
          return { error: 'Empty object provided' };
        } else {
          set.status = 400;
          return { error: 'Cannot determine server name. Please use format: { "server-name": { config } } or { "mcpServers": { "server-name": { config } } }' };
        }
      }
      // Format 3: Not supported without name
      else {
        set.status = 400;
        return { error: 'Cannot determine server name. Please wrap config with server name: { "my-server": { "command": "..." } }' };
      }

      // Must have extracted a name
      if (!name) {
        set.status = 400;
        return { error: 'Server name not found in JSON' };
      }

      // Validate we have a valid config object
      if (!config || typeof config !== 'object') {
        set.status = 400;
        return { error: 'Invalid config format' };
      }

      // Detect type from config structure
      let type: 'stdio' | 'sse' | 'http';
      if (config.command) {
        type = 'stdio';
      } else if (config.type === 'sse' || config.type === 'http') {
        type = config.type;
      } else if (config.url) {
        // Default to http if url is present but no type specified
        type = 'http';
      } else {
        set.status = 400;
        return { error: 'Invalid config: must have either "command" (stdio) or "url" with "type" (sse/http)' };
      }

      // Validate config based on detected type
      if (type === 'stdio' && !config.command) {
        set.status = 400;
        return { error: 'stdio type requires "command" field' };
      }

      if ((type === 'sse' || type === 'http') && !config.url) {
        set.status = 400;
        return { error: `${type} type requires "url" field` };
      }

      // Local scope requires projectPath
      if (scope === 'local' && !projectPath) {
        set.status = 400;
        return { error: 'local scope requires projectPath query parameter' };
      }

      const server = setMCPServer(name, {
        type,
        scope,
        projectPath,
        config
      });

      console.log(`✅ MCP server '${name}' saved successfully (${type}, ${scope} scope)`);
      return {
        success: true,
        message: `MCP server '${name}' saved successfully`,
        server
      };
    } catch (error) {
      console.error('❌ Error saving MCP server:', error);
      set.status = 500;
      return { error: 'Failed to save MCP server' };
    }
  }, {
    query: t.Object({
      scope: t.Optional(t.Union([t.Literal('user'), t.Literal('local')])),
      projectPath: t.Optional(t.String())
    }),
    body: t.Any({
      description: "MCP server configuration. Accepts multiple formats for easy copy-paste."
    }),
    detail: {
      tags: ["MCP"],
      summary: "Add/Update MCP Server (Smart Format Detection)",
      description: `Add or update an MCP server configuration with intelligent format detection. Server name is automatically extracted from JSON.

**Supported Input Formats:**

**Format 1: Wrapped with server name (copy from .mcp.json)**
\`\`\`json
POST /api/mcp/add?scope=user
{
  "my-tool": {
    "command": "node",
    "args": ["./my-mcp-server.js"],
    "env": {
      "DEBUG": "\${DEBUG:-false}"
    }
  }
}
\`\`\`

**Format 2: Full mcpServers format (copy from .claude.json)**
\`\`\`json
POST /api/mcp/add?scope=user
{
  "mcpServers": {
    "my-tool": {
      "command": "node",
      "args": ["./my-mcp-server.js"],
      "env": {
        "DEBUG": "\${DEBUG:-false}"
      }
    }
  }
}
\`\`\`

**SSE/HTTP Examples:**
\`\`\`json
POST /api/mcp/add?scope=user
{
  "remote-api": {
    "type": "sse",
    "url": "https://api.example.com/mcp/sse",
    "headers": {
      "Authorization": "Bearer \${API_TOKEN}"
    }
  }
}
\`\`\`

**Local scope:**
\`\`\`json
POST /api/mcp/add?scope=local&projectPath=/path/to/project
{
  "local-tool": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
  }
}
\`\`\`

**Note:** Server name is automatically extracted from the JSON structure. Just copy and paste your MCP configuration!
`
    }
  })

  // Delete MCP server
  .delete("/:name", async ({ params, set }) => {
    try {
      const { name } = params;

      const success = deleteMCPServer(name);

      if (success) {
        console.log(`🗑️ Deleted MCP server: ${name}`);
        return { success: true, message: `MCP server '${name}' deleted` };
      } else {
        set.status = 404;
        return { error: 'MCP server not found' };
      }
    } catch (error) {
      console.error('❌ Error deleting MCP server:', error);
      set.status = 500;
      return { error: 'Failed to delete MCP server' };
    }
  }, {
    params: t.Object({
      name: t.String()
    }),
    detail: {
      tags: ["MCP"],
      summary: "Delete MCP Server",
      description: "Delete an MCP server configuration"
    }
  })

  // Get MCP config JSON (for Claude CLI)
  .get("/config/json", async ({ query, set }) => {
    try {
      const { projectPath } = query as { projectPath?: string };

      const config = getMCPConfigJSON(projectPath);

      if (!config) {
        return {
          hasConfig: false,
          config: null,
          serversCount: 0
        };
      }

      return {
        hasConfig: true,
        config,
        serversCount: Object.keys(config.mcpServers || {}).length,
        preview: JSON.stringify(config, null, 2)
      };
    } catch (error) {
      console.error('❌ Error getting MCP config JSON:', error);
      set.status = 500;
      return { error: 'Failed to get MCP config JSON' };
    }
  }, {
    query: t.Object({
      projectPath: t.Optional(t.String())
    }),
    detail: {
      tags: ["MCP"],
      summary: "Get MCP Config JSON",
      description: "Get MCP configuration in Claude-compatible JSON format. This shows what will be written to the temporary config file when Claude CLI is launched."
    }
  })

  // Bulk import MCP servers from JSON
  .post("/import", async ({ body, set }) => {
    try {
      const { config, clearExisting } = body as { config: Record<string, any>; clearExisting?: boolean };

      if (!config || typeof config !== 'object') {
        set.status = 400;
        return { error: 'Invalid config format' };
      }

      // Clear existing servers if requested
      if (clearExisting) {
        clearAllMCPServers();
        console.log('🗑️ Cleared all existing MCP servers');
      }

      const result = bulkImportMCPServers(config);

      console.log(`✅ Imported ${result.imported} MCP servers`);
      if (result.errors.length > 0) {
        console.warn('⚠️ Import errors:', result.errors);
      }

      return {
        success: true,
        imported: result.imported,
        errors: result.errors
      };
    } catch (error) {
      console.error('❌ Error importing MCP servers:', error);
      set.status = 500;
      return { error: 'Failed to import MCP servers' };
    }
  }, {
    body: t.Object({
      config: t.Any(),
      clearExisting: t.Optional(t.Boolean())
    }),
    detail: {
      tags: ["MCP"],
      summary: "Bulk Import MCP Servers",
      description: `Import multiple MCP servers from a Claude-compatible JSON configuration.

Example request body:
\`\`\`json
{
  "config": {
    "mcpServers": {
      "filesystem": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/files"]
      },
      "brave-search": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-brave-search"],
        "env": {
          "BRAVE_API_KEY": "your-api-key"
        }
      }
    }
  },
  "clearExisting": false
}
\`\`\`
`
    }
  })

  // Clear all MCP servers
  .delete("/", async ({ set }) => {
    try {
      clearAllMCPServers();
      console.log('🗑️ Cleared all MCP servers');

      return {
        success: true,
        message: 'All MCP servers cleared'
      };
    } catch (error) {
      console.error('❌ Error clearing MCP servers:', error);
      set.status = 500;
      return { error: 'Failed to clear MCP servers' };
    }
  }, {
    detail: {
      tags: ["MCP"],
      summary: "Clear All MCP Servers",
      description: "Delete all MCP server configurations"
    }
  });
