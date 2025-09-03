/**
 * PROJECT DISCOVERY AND MANAGEMENT SYSTEM
 * ========================================
 * 
 * This module manages project discovery for both Claude CLI and Cursor CLI sessions.
 * Ported from Node.js to Bun with performance optimizations.
 */

import { readdir, readFile, access } from 'fs/promises';
import { createReadStream as createSyncReadStream } from 'fs';
import { join, basename } from 'path';
import { createHash } from 'crypto';
import { createInterface } from 'readline';
import { homedir } from 'os';
import { Database } from 'bun:sqlite';
import { getManuallyAddedProjects } from './projectConfig.ts';

// Cache for project directory extraction
const projectDirectoryCache = new Map<string, string>();



interface Project {
  name: string;
  path: string;
  displayName: string;
  fullPath: string;
  isCustomName: boolean;
  sessions: any[];
  sessionMeta: {
    hasMore: boolean;
    total: number;
  };
  manuallyAdded?: boolean;
}

/**
 * Generate better display name from project path
 */
async function generateDisplayName(projectName: string, actualProjectDir?: string): Promise<string> {
  // Use actual project directory if provided, otherwise decode from project name
  let projectPath = actualProjectDir || projectName.replace(/-/g, '/');
  
  // Try to read package.json from the project path
  try {
    const packageJsonPath = join(projectPath, 'package.json');
    const packageData = await readFile(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageData);
    
    // Return the name from package.json if it exists
    if (packageJson.name) {
      return packageJson.name;
    }
  } catch (error) {
    // Fall back to path-based naming if package.json doesn't exist or can't be read
  }
  
  // If it starts with /, it's an absolute path
  if (projectPath.startsWith('/')) {
    const parts = projectPath.split('/').filter(Boolean);
    // Return only the last folder name
    return parts[parts.length - 1] || projectPath;
  }
  
  return projectPath;
}

/**
 * Extract the actual project directory from JSONL sessions (with caching)
 */
async function extractProjectDirectory(projectName: string): Promise<string> {
  // Check cache first
  if (projectDirectoryCache.has(projectName)) {
    return projectDirectoryCache.get(projectName)!;
  }
  
  const projectDir = join(homedir(), '.claude', 'projects', projectName);
  const cwdCounts = new Map<string, number>();
  let latestTimestamp = 0;
  let latestCwd: string | null = null;
  let extractedPath: string;
  
  try {
    // Check if the project directory exists
    await access(projectDir);
    
    const files = await readdir(projectDir);
    const jsonlFiles = files.filter(file => file.endsWith('.jsonl'));
    
    if (jsonlFiles.length === 0) {
      // Fall back to decoded project name if no sessions
      extractedPath = projectName.replace(/-/g, '/');
    } else {
      // Process all JSONL files to collect cwd values
      for (const file of jsonlFiles) {
        const jsonlFile = join(projectDir, file);
        const fileStream = createSyncReadStream(jsonlFile);
        const rl = createInterface({
          input: fileStream,
          crlfDelay: Infinity
        });
        
        for await (const line of rl) {
          if (line.trim()) {
            try {
              const entry = JSON.parse(line);
              
              if (entry.cwd) {
                // Count occurrences of each cwd
                cwdCounts.set(entry.cwd, (cwdCounts.get(entry.cwd) || 0) + 1);
                
                // Track the most recent cwd
                const timestamp = new Date(entry.timestamp || 0).getTime();
                if (timestamp > latestTimestamp) {
                  latestTimestamp = timestamp;
                  latestCwd = entry.cwd;
                }
              }
            } catch (parseError) {
              // Skip malformed lines
            }
          }
        }
      }
      
      // Determine the best cwd to use
      if (cwdCounts.size === 0) {
        // No cwd found, fall back to decoded project name
        extractedPath = projectName.replace(/-/g, '/');
      } else if (cwdCounts.size === 1) {
        // Only one cwd, use it
        const firstKey = Array.from(cwdCounts.keys())[0];
        extractedPath = firstKey || projectName.replace(/-/g, '/');
      } else {
        // Multiple cwd values - prefer the most recent one if it has reasonable usage
        const entries = Array.from(cwdCounts.entries()).sort((a, b) => b[1] - a[1]);
        const mostFrequent = entries[0]?.[0];

        if (!mostFrequent) {
          extractedPath = projectName.replace(/-/g, '/');
        } else {
          const latestCount = latestCwd ? cwdCounts.get(latestCwd) || 0 : 0;
          const mostFrequentCount = cwdCounts.get(mostFrequent) || 0;

          // Use latest if it has at least 30% of the most frequent count
          if (latestCwd && latestCount >= mostFrequentCount * 0.3) {
            extractedPath = latestCwd;
          } else {
            extractedPath = mostFrequent;
          }
        }
      }
    }
  } catch (error) {
    // If directory doesn't exist or other error, fall back to decoded name
    extractedPath = projectName.replace(/-/g, '/');
  }
  
  // Cache the result
  projectDirectoryCache.set(projectName, extractedPath);
  return extractedPath;
}

/**
 * Get MD5 hash of project path for Cursor directory lookup
 */
function getProjectHash(projectPath: string): string {
  return createHash('md5').update(projectPath).digest('hex');
}



/**
 * Get basic session info for a Claude project (using new session manager)
 */
async function getClaudeProjectSessions(projectDir: string): Promise<{
  sessions: any[];
  sessionMeta: { total: number; lastActivity?: string };
}> {
  try {
    // Use the new session manager to get sessions
    const { getClaudeSessions } = await import('./sessionManagerNew.ts');
    const result = await getClaudeSessions(projectDir, 5, 0);

    return {
      sessions: result.sessions,
      sessionMeta: {
        total: result.total,
        lastActivity: result.sessions[0]?.lastActivity
      }
    };
  } catch (error) {
    return {
      sessions: [],
      sessionMeta: { total: 0 }
    };
  }
}



/**
 * Check if a directory name is a system file that should be ignored
 */
function isSystemFile(dirName: string): boolean {
  const systemFiles = [
    '.DS_Store',
    '.Trashes',
    '.Spotlight-V100',
    '.fseventsd',
    'Thumbs.db',
    'desktop.ini'
  ];
  return systemFiles.includes(dirName);
}

/**
 * Discover Claude projects from ~/.claude/projects/
 */
async function discoverClaudeProjects(): Promise<Project[]> {
  const projects: Project[] = [];
  const claudeProjectsPath = join(homedir(), '.claude', 'projects');

  try {
    await access(claudeProjectsPath);
    const allDirs = await readdir(claudeProjectsPath);

    // Filter out system files
    const projectDirs = allDirs.filter(dir => !isSystemFile(dir));

    console.log(`🔍 Found ${projectDirs.length} Claude project directories (filtered ${allDirs.length - projectDirs.length} system files)`);

    for (const projectDir of projectDirs) {
      try {
        console.log(`📁 Processing Claude project: ${projectDir}`);

        const actualPath = await extractProjectDirectory(projectDir);
        const displayName = await generateDisplayName(projectDir, actualPath);

        // Get Claude sessions
        const { sessions, sessionMeta } = await getClaudeProjectSessions(projectDir);

        const project: Project = {
          name: projectDir,
          path: actualPath,
          displayName,
          fullPath: actualPath,
          isCustomName: false,
          sessions,
          sessionMeta: {
            hasMore: sessionMeta.total > 5, // Assuming we show 5 sessions by default
            total: sessionMeta.total
          }
        };

        console.log(`✅ Project ${displayName}: ${sessions.length} Claude sessions`);
        projects.push(project);
      } catch (error) {
        console.error(`❌ Error processing Claude project ${projectDir}:`, error);
      }
    }
  } catch (error) {
    console.log('📂 Claude projects directory not found, skipping Claude project discovery');
  }

  return projects;
}

/**
 * Main function to discover all projects
 */
export async function discoverProjects(): Promise<Project[]> {
  try {
    console.log('🔍 Starting project discovery...');
    
    // Discover Claude projects
    const claudeProjects = await discoverClaudeProjects();
    console.log(`📁 Found ${claudeProjects.length} Claude projects`);
    
    // Load manually added projects from config
    const manualProjects = await getManuallyAddedProjects();
    
    console.log(`📝 Found ${manualProjects.length} manually added projects`);
    
    // Combine all projects
    const allProjects = [...claudeProjects, ...manualProjects];
    
    console.log(`✅ Project discovery completed: ${allProjects.length} total projects`);
    return allProjects;
    
  } catch (error) {
    console.error('❌ Error during project discovery:', error);
    return [];
  }
}

// Export utility functions for testing
export {
  generateDisplayName,
  extractProjectDirectory,
  getProjectHash
};
