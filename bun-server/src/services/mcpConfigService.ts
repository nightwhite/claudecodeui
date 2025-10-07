/**
 * MCP CONFIGURATION SERVICE
 * =========================
 *
 * Manages MCP server configurations in memory
 * Provides JSON config for Claude CLI --mcp-config parameter
 */

interface MCPServerConfig {
  // stdio fields (no type field)
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // sse/http fields (requires type field)
  type?: 'sse' | 'http';
  url?: string;
  headers?: Record<string, string>;
  timeout?: number;
}

interface MCPServer {
  name: string;
  type: 'stdio' | 'sse' | 'http';
  scope: 'user' | 'local';
  projectPath?: string; // For local scope
  config: MCPServerConfig;
  description?: string;
  created_at: string;
  updated_at: string;
}

// In-memory storage for MCP servers
const mcpServersStore = new Map<string, MCPServer>();

/**
 * Get all MCP servers
 */
export function getAllMCPServers(): MCPServer[] {
  return Array.from(mcpServersStore.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get a specific MCP server
 */
export function getMCPServer(name: string): MCPServer | null {
  return mcpServersStore.get(name) || null;
}

/**
 * Add or update an MCP server
 */
export function setMCPServer(name: string, serverData: Omit<MCPServer, 'name' | 'created_at' | 'updated_at'>): MCPServer {
  const now = new Date().toISOString();
  const existing = mcpServersStore.get(name);

  const server: MCPServer = {
    name,
    ...serverData,
    created_at: existing?.created_at || now,
    updated_at: now
  };

  mcpServersStore.set(name, server);
  return server;
}

/**
 * Delete an MCP server
 */
export function deleteMCPServer(name: string): boolean {
  return mcpServersStore.delete(name);
}

/**
 * Get MCP configuration as Claude-compatible JSON format
 * Returns null if no servers configured
 */
export function getMCPConfigJSON(projectPath?: string): Record<string, any> | null {
  const servers = getAllMCPServers();

  if (servers.length === 0) {
    return null;
  }

  const config: Record<string, any> = {
    mcpServers: {}
  };

  // Global (user-scoped) servers
  const globalServers = servers.filter(s => s.scope === 'user');
  for (const server of globalServers) {
    config.mcpServers[server.name] = server.config;
  }

  // Project-specific (local-scoped) servers - merge into same mcpServers object
  if (projectPath) {
    const localServers = servers.filter(s => s.scope === 'local' && s.projectPath === projectPath);
    for (const server of localServers) {
      config.mcpServers[server.name] = server.config;
    }
  }

  // Return null if no servers configured
  return Object.keys(config.mcpServers).length > 0 ? config : null;
}

/**
 * Check if there are any MCP servers configured
 */
export function hasMCPServers(): boolean {
  return mcpServersStore.size > 0;
}

/**
 * Get the count of MCP servers
 */
export function getMCPServerCount(): number {
  return mcpServersStore.size;
}

/**
 * Clear all MCP servers
 */
export function clearAllMCPServers(): void {
  mcpServersStore.clear();
}

/**
 * Bulk import MCP servers from JSON
 */
export function bulkImportMCPServers(config: Record<string, any>): { imported: number; errors: string[] } {
  let imported = 0;
  const errors: string[] = [];

  try {
    // Import global servers
    if (config.mcpServers && typeof config.mcpServers === 'object') {
      for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
        try {
          const type = (serverConfig as any).command ? 'stdio' : 'http';
          setMCPServer(name, {
            type,
            scope: 'user',
            config: serverConfig as MCPServerConfig
          });
          imported++;
        } catch (error) {
          errors.push(`Failed to import server '${name}': ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    // Import project-specific servers
    if (config.projects && typeof config.projects === 'object') {
      for (const [projectPath, projectConfig] of Object.entries(config.projects)) {
        if ((projectConfig as any).mcpServers && typeof (projectConfig as any).mcpServers === 'object') {
          for (const [name, serverConfig] of Object.entries((projectConfig as any).mcpServers)) {
            try {
              const type = (serverConfig as any).command ? 'stdio' : 'http';
              setMCPServer(`${name}-${projectPath}`, {
                type,
                scope: 'local',
                projectPath,
                config: serverConfig as MCPServerConfig
              });
              imported++;
            } catch (error) {
              errors.push(`Failed to import project server '${name}': ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }
        }
      }
    }
  } catch (error) {
    errors.push(`Failed to parse config: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return { imported, errors };
}
