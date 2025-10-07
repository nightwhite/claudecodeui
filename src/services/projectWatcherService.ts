/**
 * PROJECT WATCHER SERVICE
 * =======================
 * 
 * File system monitoring service for Claude projects folder
 * Notifies connected WebSocket clients about project changes
 */

import chokidar, { type FSWatcher } from 'chokidar';
import path from 'path';
import os from 'os';
import { discoverProjects } from './projectDiscovery.ts';

interface WebSocketClient {
  send(data: string): void;
  readyState: number;
  OPEN: number;
}

// Track connected WebSocket clients
const connectedClients = new Set<WebSocketClient>();

// File system watcher instance
let projectsWatcher: FSWatcher | null = null;

/**
 * Add a WebSocket client to receive project updates
 */
export function addProjectWatcherClient(client: WebSocketClient): void {
  connectedClients.add(client);
  console.log(`📡 Added project watcher client. Total: ${connectedClients.size}`);
}

/**
 * Remove a WebSocket client from project updates
 */
export function removeProjectWatcherClient(client: WebSocketClient): void {
  connectedClients.delete(client);
  console.log(`📡 Removed project watcher client. Total: ${connectedClients.size}`);
}

/**
 * Broadcast project update to all connected clients
 */
async function broadcastProjectUpdate(eventType: string, filePath: string): Promise<void> {
  if (connectedClients.size === 0) {
    return; // No clients to notify
  }

  try {
    // Get updated projects list
    const updatedProjects = await discoverProjects();
    const claudeProjectsPath = path.join(os.homedir(), '.claude', 'projects');

    // Create update message
    const updateMessage = JSON.stringify({
      type: 'projects_updated',
      projects: updatedProjects,
      timestamp: new Date().toISOString(),
      changeType: eventType,
      changedFile: path.relative(claudeProjectsPath, filePath)
    });

    // Send to all connected clients
    const clientsToRemove: WebSocketClient[] = [];
    
    connectedClients.forEach(client => {
      if (client.readyState === client.OPEN) {
        try {
          client.send(updateMessage);
        } catch (error) {
          console.error('Error sending to WebSocket client:', error);
          clientsToRemove.push(client);
        }
      } else {
        clientsToRemove.push(client);
      }
    });

    // Clean up disconnected clients
    clientsToRemove.forEach(client => {
      connectedClients.delete(client);
    });

  } catch (error) {
    console.error('❌ Error handling project changes:', error);
  }
}

/**
 * Setup file system watcher for Claude projects folder
 */
export async function setupProjectsWatcher(): Promise<void> {
  const claudeProjectsPath = path.join(os.homedir(), '.claude', 'projects');

  // Close existing watcher
  if (projectsWatcher) {
    await projectsWatcher.close();
    projectsWatcher = null;
  }

  try {
    console.log('🔍 Setting up projects watcher for:', claudeProjectsPath);

    // Initialize chokidar watcher with optimized settings
    projectsWatcher = chokidar.watch(claudeProjectsPath, {
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/*.tmp',
        '**/*.swp',
        '**/.DS_Store'
      ],
      persistent: true,
      ignoreInitial: true, // Don't fire events for existing files on startup
      followSymlinks: false,
      depth: 10, // Reasonable depth limit
      awaitWriteFinish: {
        stabilityThreshold: 100, // Wait 100ms for file to stabilize
        pollInterval: 50
      }
    });

    // Debounce function to prevent excessive notifications
    let debounceTimer: NodeJS.Timeout | null = null;
    const debouncedUpdate = async (eventType: string, filePath: string) => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      
      debounceTimer = setTimeout(async () => {
        await broadcastProjectUpdate(eventType, filePath);
        debounceTimer = null;
      }, 300); // 300ms debounce
    };

    // Set up event listeners
    projectsWatcher
      .on('add', (filePath: string) => debouncedUpdate('add', filePath))
      .on('change', (filePath: string) => debouncedUpdate('change', filePath))
      .on('unlink', (filePath: string) => debouncedUpdate('unlink', filePath))
      .on('addDir', (dirPath: string) => debouncedUpdate('addDir', dirPath))
      .on('unlinkDir', (dirPath: string) => debouncedUpdate('unlinkDir', dirPath))
      .on('error', (error: unknown) => {
        console.error('❌ Projects watcher error:', error);
      })
      .on('ready', () => {
        console.log('✅ Projects watcher ready');
      });

  } catch (error) {
    console.error('❌ Failed to setup projects watcher:', error);
  }
}

/**
 * Stop the projects watcher
 */
export async function stopProjectsWatcher(): Promise<void> {
  if (projectsWatcher) {
    console.log('🛑 Stopping projects watcher');
    await projectsWatcher.close();
    projectsWatcher = null;
  }
  
  // Clear connected clients
  connectedClients.clear();
}

/**
 * Get current watcher status
 */
export function getWatcherStatus(): { 
  isWatching: boolean; 
  connectedClients: number; 
  watchedPath: string;
} {
  const claudeProjectsPath = path.join(os.homedir(), '.claude', 'projects');
  
  return {
    isWatching: projectsWatcher !== null,
    connectedClients: connectedClients.size,
    watchedPath: claudeProjectsPath
  };
}