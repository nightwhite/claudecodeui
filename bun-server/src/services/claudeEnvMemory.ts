/**
 * CLAUDE ENVIRONMENT VARIABLES - MEMORY STORAGE
 * =============================================
 * 
 * Stores Claude CLI environment variables in memory
 * Variables are lost on server restart
 */

interface ClaudeEnvVar {
  key: string;
  value: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

// In-memory storage for Claude environment variables
const claudeEnvStore = new Map<string, ClaudeEnvVar>();



/**
 * Get all Claude environment variables
 */
export function getAllClaudeEnvVars(): ClaudeEnvVar[] {
  return Array.from(claudeEnvStore.values()).sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Get a specific Claude environment variable
 */
export function getClaudeEnvVar(key: string): ClaudeEnvVar | null {
  return claudeEnvStore.get(key) || null;
}

/**
 * Set or update a Claude environment variable
 */
export function setClaudeEnvVar(key: string, value: string, description?: string): ClaudeEnvVar {
  const now = new Date().toISOString();
  const existing = claudeEnvStore.get(key);
  
  const envVar: ClaudeEnvVar = {
    key,
    value,
    description,
    created_at: existing?.created_at || now,
    updated_at: now
  };
  
  claudeEnvStore.set(key, envVar);
  return envVar;
}

/**
 * Delete a Claude environment variable
 */
export function deleteClaudeEnvVar(key: string): boolean {
  return claudeEnvStore.delete(key);
}

/**
 * Bulk update Claude environment variables
 */
export function bulkUpdateClaudeEnvVars(envVars: Record<string, string>): ClaudeEnvVar[] {
  const results: ClaudeEnvVar[] = [];
  
  for (const [key, value] of Object.entries(envVars)) {
    if (key && value !== undefined) {
      const envVar = setClaudeEnvVar(key, value);
      results.push(envVar);
    }
  }
  
  return results;
}

/**
 * Get Claude environment variables as a Record for process spawning
 */
export function getClaudeEnvAsRecord(): Record<string, string> {
  const envRecord: Record<string, string> = {};
  
  for (const [key, envVar] of claudeEnvStore) {
    envRecord[key] = envVar.value;
  }
  
  return envRecord;
}

/**
 * Check if a Claude environment variable exists
 */
export function hasClaudeEnvVar(key: string): boolean {
  return claudeEnvStore.has(key);
}

/**
 * Get the count of Claude environment variables
 */
export function getClaudeEnvCount(): number {
  return claudeEnvStore.size;
}

/**
 * Clear all Claude environment variables
 */
export function clearAllClaudeEnvVars(): void {
  claudeEnvStore.clear();
}
