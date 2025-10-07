/**
 * SESSION MANAGEMENT SYSTEM (Based on Original Server Logic)
 * ==========================================================
 * 
 * Handles Claude session discovery and management following the exact logic from the original Node.js server
 */

import { readdir, access, readFile, writeFile } from 'fs/promises';
import { createReadStream } from 'fs';
import { join, basename } from 'path';
import { createInterface } from 'readline';
import { homedir } from 'os';

interface ClaudeSession {
  id: string;
  summary: string;
  lastActivity: string;
  messageCount: number;
  cwd: string;
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
                summary: 'New Session',
                messageCount: 0,
                lastActivity: new Date().toISOString(),
                cwd: entry.cwd || ''
              });
            }

            const session = sessions.get(entry.sessionId)!;

            // Update summary if this is a summary entry
            if (entry.type === 'summary' && entry.summary) {
              session.summary = entry.summary;
            } else if (entry.message?.role === 'user' && entry.message?.content && session.summary === 'New Session') {
              // Use first user message as summary if no summary entry exists
              const content = entry.message.content;
              if (typeof content === 'string' && content.length > 0) {
                // Skip command messages that start with <command-name>
                if (!content.startsWith('<command-name>')) {
                  session.summary = content.length > 50 ? content.substring(0, 50) + '...' : content;
                }
              }
            }

            // Count only actual messages (user or assistant), not system events
            if (entry.message?.role === 'user' || entry.message?.role === 'assistant') {
              session.messageCount = (session.messageCount || 0) + 1;
            }
            
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
 * Get Claude sessions for a project (following original server logic)
 */
export async function getClaudeSessions(projectName: string, limit = 5, offset = 0): Promise<{
  sessions: ClaudeSession[];
  hasMore: boolean;
  total: number;
  offset: number;
  limit: number;
}> {
  const projectPath = join(homedir(), '.claude', 'projects', projectName);
  
  try {
    await access(projectPath);
    const files = await readdir(projectPath);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
    
    if (jsonlFiles.length === 0) {
      return { sessions: [], total: 0, hasMore: false, offset, limit };
    }
    
    // For performance, get file stats to sort by modification time
    const filesWithStats = await Promise.all(
      jsonlFiles.map(async (file) => {
        const filePath = join(projectPath, file);
        const stat = await Bun.file(filePath).stat();
        return { file, mtime: stat.mtime };
      })
    );
    
    // Sort files by modification time (newest first) for better performance
    filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    
    const allSessions = new Map<string, ClaudeSession>();

    // Process ALL files to get the true total count
    for (const { file } of filesWithStats) {
      const jsonlFile = join(projectPath, file);
      const sessions = await parseJsonlSessions(jsonlFile);

      // Merge sessions, avoiding duplicates by session ID
      sessions.forEach(session => {
        if (!allSessions.has(session.id)) {
          allSessions.set(session.id, session);
        }
      });
    }

    // Convert to array and sort by last activity
    const sortedSessions = Array.from(allSessions.values()).sort((a, b) =>
      new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    );

    const total = sortedSessions.length;
    const paginatedSessions = sortedSessions.slice(offset, offset + limit);
    const hasMore = offset + limit < total;
    
    return {
      sessions: paginatedSessions,
      hasMore,
      total,
      offset,
      limit
    };
    
  } catch (error) {
    console.error('Error getting Claude sessions:', error);
    return { sessions: [], hasMore: false, total: 0, offset, limit };
  }
}

/**
 * Get messages for a specific session with pagination support
 */
export async function getClaudeSessionMessages(
  projectName: string,
  sessionId: string,
  limit: number | null = null,
  offset = 0
): Promise<any[] | {
  messages: any[];
  total: number;
  hasMore: boolean;
  offset: number;
  limit: number;
}> {
  const projectPath = join(homedir(), '.claude', 'projects', projectName);

  try {
    await access(projectPath);
    const files = await readdir(projectPath);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

    if (jsonlFiles.length === 0) {
      return limit === null ? [] : { messages: [], total: 0, hasMore: false, offset, limit: limit || 50 };
    }

    const messages: any[] = [];

    // Process all JSONL files to find messages for this session
    for (const file of jsonlFiles) {
      const jsonlFile = join(projectPath, file);
      const fileStream = createReadStream(jsonlFile);
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      for await (const line of rl) {
        if (line.trim()) {
          try {
            const entry = JSON.parse(line);
            if (entry.sessionId === sessionId) {
              messages.push(entry);
            }
          } catch (parseError) {
            console.warn('Error parsing line:', parseError);
          }
        }
      }
    }

    // Sort messages by timestamp
    const sortedMessages = messages.sort((a, b) =>
      new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()
    );

    const total = sortedMessages.length;

    // If no limit is specified, return all messages (backward compatibility)
    if (limit === null) {
      return sortedMessages;
    }

    // Apply pagination - for recent messages, we need to slice from the end
    // offset 0 should give us the most recent messages
    const startIndex = Math.max(0, total - offset - limit);
    const endIndex = total - offset;
    const paginatedMessages = sortedMessages.slice(startIndex, endIndex);
    const hasMore = startIndex > 0;

    return {
      messages: paginatedMessages,
      total,
      hasMore,
      offset,
      limit
    };
  } catch (error) {
    console.error(`Error reading messages for session ${sessionId}:`, error);
    return limit === null ? [] : { messages: [], total: 0, hasMore: false, offset, limit: limit || 50 };
  }
}

/**
 * Delete a session from a project
 */
export async function deleteSession(projectName: string, sessionId: string): Promise<void> {
  const projectPath = join(homedir(), '.claude', 'projects', projectName);

  try {
    await access(projectPath);
    const files = await readdir(projectPath);
    const jsonlFiles = files.filter(file => file.endsWith('.jsonl'));

    if (jsonlFiles.length === 0) {
      throw new Error('No session files found for this project');
    }

    let sessionFound = false;

    // Process each JSONL file
    for (const file of jsonlFiles) {
      const jsonlFile = join(projectPath, file);
      const content = await readFile(jsonlFile, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      let hasSession = false;

      // Check if this file contains the session
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.sessionId === sessionId) {
            hasSession = true;
            sessionFound = true;
            break;
          }
        } catch {
          // Skip malformed lines
        }
      }

      if (hasSession) {
        // Filter out all entries for this session
        const filteredLines = lines.filter(line => {
          try {
            const data = JSON.parse(line);
            return data.sessionId !== sessionId;
          } catch {
            return true; // Keep malformed lines
          }
        });

        // Write back the filtered content
        const newContent = filteredLines.length > 0 ? filteredLines.join('\n') + '\n' : '';
        await writeFile(jsonlFile, newContent, 'utf-8');
        console.log(`🗑️ Removed session ${sessionId} from ${file}`);
      }
    }

    if (!sessionFound) {
      throw new Error(`Session ${sessionId} not found in any files`);
    }

    console.log(`✅ Session deleted successfully: ${sessionId}`);
  } catch (error) {
    console.error(`❌ Error deleting session ${sessionId} from project ${projectName}:`, error);
    throw error;
  }
}
