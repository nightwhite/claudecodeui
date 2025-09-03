import { Database } from "bun:sqlite";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { config } from "../config.ts";
import { initializeClaudeEnvDefaults } from "./claudeEnv.ts";

// Get current directory for init.sql
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use configured database path (can be relative or absolute)
const DB_PATH = resolve(config.dbPath);
const INIT_SQL_PATH = join(__dirname, 'init.sql');

// Ensure database directory exists
const dbDir = dirname(DB_PATH);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
  console.log(`📁 Created database directory: ${dbDir}`);
}

// Create database connection
const db = new Database(DB_PATH);
console.log(`📊 Connected to SQLite database at: ${DB_PATH}`);

// Initialize database with schema
export const initializeDatabase = async () => {
  try {
    if (existsSync(INIT_SQL_PATH)) {
      const initSQL = readFileSync(INIT_SQL_PATH, 'utf8');
      db.exec(initSQL);
      console.log('Database initialized successfully');
      
      // Initialize Claude environment variables defaults
      initializeClaudeEnvDefaults();
    }
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

// User database operations
export const userDb = {
  // Check if any users exist
  hasUsers: () => {
    try {
      const result = db.query('SELECT COUNT(*) as count FROM users WHERE is_active = 1').get() as { count: number };
      return result.count > 0;
    } catch (err) {
      console.error('Error checking if users exist:', err);
      return false;
    }
  },

  // Create a new user
  createUser: (username: string, passwordHash: string) => {
    try {
      const stmt = db.query('INSERT INTO users (username, password_hash) VALUES (?, ?) RETURNING id, username');
      const result = stmt.get(username, passwordHash) as { id: number; username: string };
      return result;
    } catch (err) {
      throw err;
    }
  },

  // Get user by username
  getUserByUsername: (username: string) => {
    try {
      const row = db.query('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);
      return row;
    } catch (err) {
      throw err;
    }
  },

  // Update last login time
  updateLastLogin: (userId: number) => {
    try {
      db.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
    } catch (err) {
      throw err;
    }
  },

  // Get user by ID
  getUserById: (userId: number) => {
    try {
      const row = db.query('SELECT id, username, created_at, last_login FROM users WHERE id = ? AND is_active = 1').get(userId);
      return row;
    } catch (err) {
      throw err;
    }
  }
};

export { db };
