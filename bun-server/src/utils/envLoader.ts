/**
 * Environment Variable Loader
 *
 * Supports loading environment variables from custom config files
 * and auto-loading from .env file
 */

import { existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';

/**
 * Load environment variables from a config file
 * Supports .env format, JSON, and JS/TS files
 */
export function loadEnvFromFile(configPath: string): Record<string, string> {
  const resolvedPath = resolve(configPath);

  if (!existsSync(resolvedPath)) {
    throw new Error(`Config file not found: ${resolvedPath}`);
  }

  console.log(`📝 Loading environment from: ${resolvedPath}`);

  // Determine file type
  if (configPath.endsWith('.json')) {
    return loadFromJSON(resolvedPath);
  } else if (configPath.endsWith('.js') || configPath.endsWith('.ts')) {
    return loadFromModule(resolvedPath);
  } else {
    // Default: .env format
    return loadFromDotEnv(resolvedPath);
  }
}

/**
 * Load from JSON file
 */
function loadFromJSON(path: string): Record<string, string> {
  const content = readFileSync(path, 'utf-8');
  const data = JSON.parse(content);

  // Flatten nested objects
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'object' && value !== null) {
      // Skip nested objects for now
      console.warn(`⚠️  Skipping nested object for key: ${key}`);
    } else {
      env[key] = String(value);
    }
  }

  return env;
}

/**
 * Load from JS/TS module
 */
function loadFromModule(path: string): Record<string, string> {
  // Use dynamic import
  const module = require(path);
  const data = module.default || module;

  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'object' && value !== null) {
      console.warn(`⚠️  Skipping nested object for key: ${key}`);
    } else {
      env[key] = String(value);
    }
  }

  return env;
}

/**
 * Load from .env format file
 */
function loadFromDotEnv(path: string): Record<string, string> {
  const content = readFileSync(path, 'utf-8');
  const env: Record<string, string> = {};

  const lines = content.split('\n');
  for (const line of lines) {
    // Skip comments and empty lines
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Parse KEY=VALUE
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      let [, key, value] = match;
      key = key.trim();
      value = value.trim();

      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      env[key] = value;
    }
  }

  return env;
}

/**
 * Load default .env file from current working directory
 */
export function loadDefaultEnv(): Record<string, string> | null {
  const envPath = join(process.cwd(), '.env');

  if (!existsSync(envPath)) {
    return null;
  }

  return loadFromDotEnv(envPath);
}

/**
 * Parse command line arguments
 */
export function parseArgs(): { configPath?: string; port?: number } {
  const args = process.argv.slice(2);
  const result: { configPath?: string; port?: number } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--env' || arg === '-e') {
      result.configPath = args[i + 1];
      i++; // Skip next arg
    } else if (arg === '--port' || arg === '-p') {
      result.port = parseInt(args[i + 1], 10);
      i++;
    } else if (arg.startsWith('--env=')) {
      result.configPath = arg.split('=')[1];
    } else if (arg.startsWith('--port=')) {
      result.port = parseInt(arg.split('=')[1], 10);
    }
  }

  return result;
}
