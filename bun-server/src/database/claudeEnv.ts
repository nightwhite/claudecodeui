/**
 * CLAUDE ENVIRONMENT VARIABLES DATABASE
 * ====================================
 * 
 * Stores Claude CLI environment variables separately from system environment
 */

import { db } from "./db.ts";

interface ClaudeEnvVar {
  id?: number;
  key: string;
  value: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Initialize default Claude environment variables
 */
export function initializeClaudeEnvDefaults(): void {
  console.log('✅ Claude environment variables system ready (no defaults set)');
}

/**
 * Get all Claude environment variables
 */
export function getAllClaudeEnvVars(): ClaudeEnvVar[] {
  const stmt = db.query('SELECT * FROM claude_env ORDER BY key');
  return stmt.all() as ClaudeEnvVar[];
}

/**
 * Get Claude environment variable by key
 */
export function getClaudeEnvVar(key: string): ClaudeEnvVar | null {
  const stmt = db.query('SELECT * FROM claude_env WHERE key = ?');
  return stmt.get(key) as ClaudeEnvVar | null;
}

/**
 * Set Claude environment variable
 */
export function setClaudeEnvVar(key: string, value: string, description?: string): boolean {
  try {
    const stmt = db.query(`
      INSERT OR REPLACE INTO claude_env (key, value, description, updated_at) 
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `);
    stmt.run(key, value, description || null);
    return true;
  } catch (error) {
    console.error('Error setting Claude env var:', error);
    return false;
  }
}

/**
 * Delete Claude environment variable
 */
export function deleteClaudeEnvVar(key: string): boolean {
  try {
    const stmt = db.query('DELETE FROM claude_env WHERE key = ?');
    const result = stmt.run(key);
    return result.changes > 0;
  } catch (error) {
    console.error('Error deleting Claude env var:', error);
    return false;
  }
}

/**
 * Get Claude environment variables as Record<string, string>
 * Only returns variables with non-empty values
 */
export function getClaudeEnvRecord(): Record<string, string> {
  const envVars = getAllClaudeEnvVars();
  const envRecord: Record<string, string> = {};
  
  for (const env of envVars) {
    if (env.value && env.value.trim()) {
      envRecord[env.key] = env.value;
    }
  }
  
  return envRecord;
}

/**
 * Bulk update Claude environment variables
 */
export function bulkUpdateClaudeEnvVars(envVars: Record<string, string>): boolean {
  try {
    const stmt = db.query(`
      INSERT OR REPLACE INTO claude_env (key, value, updated_at) 
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `);

    // Bun SQLite doesn't have transaction wrapper, execute statements directly
    for (const [key, value] of Object.entries(envVars)) {
      stmt.run(key, value);
    }

    return true;
  } catch (error) {
    console.error('Error bulk updating Claude env vars:', error);
    return false;
  }
}