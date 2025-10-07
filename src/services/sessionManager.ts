/**
 * SESSION MANAGEMENT SYSTEM
 * =========================
 * 
 * Handles Claude and Cursor session discovery and management
 */

import { readdir, readFile, access } from 'fs/promises';
import { createReadStream } from 'fs';
import { join, basename } from 'path';
import { createInterface } from 'readline';
import { homedir } from 'os';
import { Database } from 'bun:sqlite';
import { createHash } from 'crypto';

interface ClaudeSession {
  id: string;
  name: string;
  lastActivity: string;
  messageCount: number;
  firstMessage?: string;
  lastMessage?: string;
}

interface CursorSession {
  id: string;
  name: string;
  lastActivity: string;
  messageCount: number;
  metadata?: any;
}

interface SessionMessage {
  type: 'user' | 'assistant';
  content: string;
  timestamp: string;
  cwd?: string;
}

/**
 * Parse JSONL file and extract sessions (following original server logic)
 */
async function parseJsonlSessions(filePath: string): Promise<ClaudeSession[]> {
  const sessions = new Map<string, ClaudeSession>();

  try {
    const fileStream = createReadStream(filePath);
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let lineCount = 0;

    for await (const line of rl) {
      if (line.trim()) {
        lineCount++;
        try {
          const entry = JSON.parse(line);

          if (entry.sessionId) {
            if (!sessions.has(entry.sessionId)) {
              sessions.set(entry.sessionId, {
                id: entry.sessionId,
                name: 'New Session',
                messageCount: 0,
                lastActivity: new Date().toISOString(),
                firstMessage: '',
                lastMessage: ''
              });
            }

            const session = sessions.get(entry.sessionId)!;

            // Update summary/name if this is a summary entry
            if (entry.type === 'summary' && entry.summary) {
              session.name = entry.summary;
            } else if (entry.message?.role === 'user' && entry.message?.content && session.name === 'New Session') {
              // Use first user message as name if no summary entry exists
              const content = entry.message.content;
              if (typeof content === 'string' && content.length > 0) {
                // Skip command messages that start with <command-name>
                if (!content.startsWith('<command-name>')) {
                  session.name = content.length > 50 ? content.substring(0, 50) + '...' : content;
                }
              }
            }

            // Count messages instead of storing them all
            session.messageCount = (session.messageCount || 0) + 1;

            // Update last activity
            if (entry.timestamp) {
              session.lastActivity = new Date(entry.timestamp).toISOString();
            }
          }
        } catch (parseError) {
          console.warn(`Error parsing line ${lineCount}:`, parseError);
        }
      }
    }
  } catch (error) {
    console.error('Error reading JSONL file:', filePath, error);
  }

  // Convert Map to Array and sort by last activity
  return Array.from(sessions.values()).sort((a, b) =>
    new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
  );
}

/**
 * Get Claude sessions for a project
 */
export async function getClaudeSessions(projectName: string, limit = 5, offset = 0): Promise<{
  sessions: ClaudeSession[];
  total: number;
  hasMore: boolean;
}> {
  const sessions: ClaudeSession[] = [];
  const projectPath = join(homedir(), '.claude', 'projects', projectName);
  
  try {
    await access(projectPath);
    const files = await readdir(projectPath);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
    
    // Sort files by modification time (most recent first)
    const fileStats = await Promise.all(
      jsonlFiles.map(async (file) => {
        const filePath = join(projectPath, file);
        const stat = await Bun.file(filePath).stat();
        return { file, mtime: stat.mtime };
      })
    );
    
    fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    
    // Process files with pagination
    const paginatedFiles = fileStats.slice(offset, offset + limit);
    
    for (const { file } of paginatedFiles) {
      const sessionId = basename(file, '.jsonl');
      const filePath = join(projectPath, file);
      
      try {
        const messages = await parseJsonlFile(filePath);
        
        if (messages.length > 0) {
          const firstMessage = messages[0];
          const lastMessage = messages[messages.length - 1];



          // Safely extract message content with fallback
          const getMessagePreview = (message: any): string => {
            // Try different content fields based on message type
            let content = '';

            if (message.content && typeof message.content === 'string') {
              content = message.content.trim();
            } else if (message.summary && typeof message.summary === 'string') {
              content = message.summary.trim();
            } else if (message.text && typeof message.text === 'string') {
              content = message.text.trim();
            } else {
              // Return a more descriptive fallback
              return `[${message.type || 'Unknown'} message]`;
            }

            // If content is empty or too short, return type-based description
            if (!content || content.length < 3) {
              return `[${message.type || 'Unknown'} message]`;
            }

            return content.length > 100
              ? content.substring(0, 100) + '...'
              : content;
          };

          // Generate a better session name from first user message
          const generateSessionName = (messages: any[]): string => {
            // Find the first user message with actual content
            const firstUserMessage = messages.find(msg =>
              msg.type === 'user' &&
              msg.content &&
              typeof msg.content === 'string' &&
              msg.content.trim().length > 3
            );

            if (firstUserMessage && firstUserMessage.content) {
              const content = firstUserMessage.content.trim();
              const shortName = content.length > 50
                ? content.substring(0, 50) + '...'
                : content;
              return shortName;
            }

            // Fallback to session ID
            return `Session ${sessionId.substring(0, 8)}...`;
          };

          sessions.push({
            id: sessionId,
            name: `Session ${sessionId}`,
            lastActivity: lastMessage?.timestamp || new Date().toISOString(),
            messageCount: messages.length,
            firstMessage: getMessagePreview(firstMessage),
            lastMessage: getMessagePreview(lastMessage)
          });
        }
      } catch (error) {
        console.error(`Error processing session ${sessionId}:`, error);
      }
    }
    
    return {
      sessions,
      total: jsonlFiles.length,
      hasMore: offset + limit < jsonlFiles.length
    };
    
  } catch (error) {
    console.error('Error getting Claude sessions:', error);
    return { sessions: [], total: 0, hasMore: false };
  }
}

/**
 * Get Cursor sessions for a project
 */
export async function getCursorSessions(projectPath: string, limit = 5, offset = 0): Promise<{
  sessions: CursorSession[];
  total: number;
  hasMore: boolean;
}> {
  const sessions: CursorSession[] = [];
  
  try {
    // Calculate MD5 hash of project path
    const cwdId = createHash('md5').update(projectPath).digest('hex');
    const cursorChatsPath = join(homedir(), '.cursor', 'chats', cwdId);
    
    await access(cursorChatsPath);
    const sessionDirs = await readdir(cursorChatsPath);
    
    // Sort session directories by name (most recent first, assuming timestamp-based naming)
    sessionDirs.sort().reverse();
    
    // Process sessions with pagination
    const paginatedSessions = sessionDirs.slice(offset, offset + limit);
    
    for (const sessionDir of paginatedSessions) {
      const sessionPath = join(cursorChatsPath, sessionDir);
      const storeDbPath = join(sessionPath, 'store.db');
      
      try {
        await access(storeDbPath);
        
        // Open SQLite database
        const db = new Database(storeDbPath, { readonly: true });
        
        try {
          // Get metadata
          const metaRows = db.query('SELECT key, value FROM meta').all() as Array<{key: string, value: string}>;
          const metadata: Record<string, any> = {};
          
          for (const row of metaRows) {
            try {
              metadata[row.key] = JSON.parse(row.value);
            } catch {
              metadata[row.key] = row.value;
            }
          }
          
          // Count messages
          const messageCount = db.query('SELECT COUNT(*) as count FROM blobs').get() as { count: number };
          
          sessions.push({
            id: sessionDir,
            name: `Cursor Session ${sessionDir}`,
            lastActivity: metadata.lastActivity || new Date().toISOString(),
            messageCount: messageCount.count,
            metadata
          });
          
        } finally {
          db.close();
        }
        
      } catch (error) {
        console.error(`Error processing Cursor session ${sessionDir}:`, error);
      }
    }
    
    return {
      sessions,
      total: sessionDirs.length,
      hasMore: offset + limit < sessionDirs.length
    };
    
  } catch (error) {
    console.error('Error getting Cursor sessions:', error);
    return { sessions: [], total: 0, hasMore: false };
  }
}

/**
 * Get messages from a Claude session
 */
export async function getClaudeSessionMessages(
  projectName: string, 
  sessionId: string, 
  limit = 50, 
  offset = 0
): Promise<{
  messages: SessionMessage[];
  total: number;
  hasMore: boolean;
}> {
  const sessionPath = join(homedir(), '.claude', 'projects', projectName, `${sessionId}.jsonl`);
  
  try {
    const allMessages = await parseJsonlFile(sessionPath);
    const paginatedMessages = allMessages.slice(offset, offset + limit);
    
    return {
      messages: paginatedMessages,
      total: allMessages.length,
      hasMore: offset + limit < allMessages.length
    };
  } catch (error) {
    console.error('Error getting Claude session messages:', error);
    return { messages: [], total: 0, hasMore: false };
  }
}

/**
 * Get messages from a Cursor session
 */
export async function getCursorSessionMessages(
  projectPath: string,
  sessionId: string,
  limit = 50,
  offset = 0
): Promise<{
  messages: any[];
  total: number;
  hasMore: boolean;
}> {
  try {
    const cwdId = createHash('md5').update(projectPath).digest('hex');
    const storeDbPath = join(homedir(), '.cursor', 'chats', cwdId, sessionId, 'store.db');
    
    await access(storeDbPath);
    
    const db = new Database(storeDbPath, { readonly: true });
    
    try {
      // Get all blobs (messages)
      const allBlobs = db.query('SELECT rowid, id, data FROM blobs ORDER BY rowid').all() as Array<{
        rowid: number;
        id: string;
        data: Buffer;
      }>;
      
      const messages: any[] = [];
      
      for (const blob of allBlobs) {
        if (blob.data && blob.data[0] === 0x7B) { // JSON format (starts with '{')
          try {
            const parsed = JSON.parse(blob.data.toString('utf8'));
            messages.push({
              id: blob.id,
              rowid: blob.rowid,
              ...parsed
            });
          } catch (error) {
            console.error('Error parsing Cursor message:', error);
          }
        }
      }
      
      const paginatedMessages = messages.slice(offset, offset + limit);
      
      return {
        messages: paginatedMessages,
        total: messages.length,
        hasMore: offset + limit < messages.length
      };
      
    } finally {
      db.close();
    }
    
  } catch (error) {
    console.error('Error getting Cursor session messages:', error);
    return { messages: [], total: 0, hasMore: false };
  }
}
