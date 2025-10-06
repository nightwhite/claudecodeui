/**
 * CLAUDE CLI SERVICE
 * ==================
 * 
 * Service for integrating with Claude CLI, handling process spawning,
 * image processing, and session management
 */

import { spawn, type ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { getClaudeEnvAsRecord } from './claudeEnvMemory.ts';

export interface ClaudeSpawnOptions {
  sessionId?: string;
  projectPath?: string;
  cwd?: string;
  resume?: boolean;
  toolsSettings?: {
    allowedTools?: string[];
    disallowedTools?: string[];
    skipPermissions?: boolean;
  };
  permissionMode?: 'default' | 'plan';
  images?: Array<{
    name: string;
    data: string;
    size: number;
    mimeType: string;
  }>;
  env?: Record<string, string>; // Custom environment variables
}

export interface WebSocketInterface {
  send(data: string): void;
  readyState?: number;
  OPEN?: number;
}

// Track active Claude processes by session ID
let activeClaudeProcesses = new Map<string, ChildProcess>();

/**
 * Clean up temporary image files and directory
 */
async function cleanupTempFiles(tempImagePaths: string[], tempDir: string | null) {
  if (tempImagePaths && tempImagePaths.length > 0) {
    for (const imagePath of tempImagePaths) {
      try {
        await fs.unlink(imagePath);
      } catch (err) {
        console.error(`Failed to delete temp image ${imagePath}:`, err);
      }
    }
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (err) {
        console.error(`Failed to delete temp directory ${tempDir}:`, err);
      }
    }
  }
}

/**
 * Process images and save them to temporary files
 */
async function processImages(images: ClaudeSpawnOptions['images'], workingDir: string) {
  const tempImagePaths: string[] = [];
  let tempDir: string | null = null;

  if (images && images.length > 0) {
    try {
      // Create temp directory in the project directory so Claude can access it
      tempDir = path.join(workingDir, '.tmp', 'images', Date.now().toString());
      await fs.mkdir(tempDir, { recursive: true });
      
      // Save each image to a temp file
      for (const [index, image] of images.entries()) {
        // Extract base64 data and mime type
        const matches = image.data.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
          console.error('Invalid image data format');
          continue;
        }
        
        const [, mimeType, base64Data] = matches;
        const extension = mimeType?.split('/')[1] || 'png';
        const filename = `image_${index}.${extension}`;
        const filepath = path.join(tempDir, filename);
        
        // Write base64 data to file
        if (base64Data) {
          await fs.writeFile(filepath, Buffer.from(base64Data, 'base64'));
        }
        tempImagePaths.push(filepath);
      }
      
    } catch (error) {
      console.error('Error processing images for Claude:', error);
    }
  }

  return { tempImagePaths, tempDir };
}

/**
 * Check for MCP configuration and return config path if available
 */
async function checkMcpConfig(): Promise<string | null> {
  try {
    console.log('🔍 Starting MCP config check...');
    const { existsSync, readFileSync } = await import('fs');
    
    // Check for MCP config in ~/.claude.json
    const claudeConfigPath = path.join(os.homedir(), '.claude.json');
    
    console.log(`🔍 Checking for MCP configs in: ${claudeConfigPath}`);
    console.log(`  Claude config exists: ${existsSync(claudeConfigPath)}`);
    
    let hasMcpServers = false;
    
    // Check Claude config for MCP servers
    if (existsSync(claudeConfigPath)) {
      try {
        const claudeConfig = JSON.parse(readFileSync(claudeConfigPath, 'utf8'));
        
        // Check global MCP servers
        if (claudeConfig.mcpServers && Object.keys(claudeConfig.mcpServers).length > 0) {
          console.log(`✅ Found ${Object.keys(claudeConfig.mcpServers).length} global MCP servers`);
          hasMcpServers = true;
        }
        
        // Check project-specific MCP servers
        if (!hasMcpServers && claudeConfig.claudeProjects) {
          const currentProjectPath = process.cwd();
          const projectConfig = claudeConfig.claudeProjects[currentProjectPath];
          if (projectConfig && projectConfig.mcpServers && Object.keys(projectConfig.mcpServers).length > 0) {
            console.log(`✅ Found ${Object.keys(projectConfig.mcpServers).length} project MCP servers`);
            hasMcpServers = true;
          }
        }
      } catch (e: any) {
        console.log(`❌ Failed to parse Claude config:`, e.message);
      }
    }
    
    console.log(`🔍 hasMcpServers result: ${hasMcpServers}`);
    
    if (hasMcpServers && existsSync(claudeConfigPath)) {
      try {
        const claudeConfig = JSON.parse(readFileSync(claudeConfigPath, 'utf8'));
        
        // Check if we have any MCP servers (global or project-specific)
        const hasGlobalServers = claudeConfig.mcpServers && Object.keys(claudeConfig.mcpServers).length > 0;
        const currentProjectPath = process.cwd();
        const projectConfig = claudeConfig.claudeProjects && claudeConfig.claudeProjects[currentProjectPath];
        const hasProjectServers = projectConfig && projectConfig.mcpServers && Object.keys(projectConfig.mcpServers).length > 0;
        
        if (hasGlobalServers || hasProjectServers) {
          console.log(`📡 MCP config found: ${claudeConfigPath}`);
          return claudeConfigPath;
        }
      } catch (e) {
        console.log('⚠️ MCP servers detected but config file is invalid');
      }
    }
    
    return null;
  } catch (error: any) {
    // If there's any error checking for MCP configs, don't add the flag
    console.log('❌ MCP config check failed:', error.message);
    console.log('Note: MCP config check failed, proceeding without MCP support');
    return null;
  }
}

/**
 * Build Claude CLI arguments array
 */
async function buildClaudeArgs(
  command: string | undefined, 
  options: ClaudeSpawnOptions,
  tempImagePaths: string[]
): Promise<string[]> {
  const { sessionId, resume, toolsSettings, permissionMode } = options;
  const args: string[] = [];
  
  // Use tools settings passed from frontend, or defaults
  const settings = toolsSettings || {
    allowedTools: [],
    disallowedTools: [],
    skipPermissions: false
  };
  
  // Add print flag with command if we have a command
  if (command && command.trim()) {
    let finalCommand = command;
    
    // Include the full image paths in the prompt for Claude to reference
    if (tempImagePaths.length > 0) {
      const imageNote = `\n\n[Images provided at the following paths:]\n${tempImagePaths.map((p, i) => `${i + 1}. ${p}`).join('\n')}`;
      finalCommand = command + imageNote;
    }
    
    args.push('--print', finalCommand);
  }
  
  // Add resume flag if resuming
  if (resume && sessionId) {
    args.push('--resume', sessionId);
  }
  
  // Add basic flags
  args.push('--output-format', 'stream-json', '--verbose');
  
  // Add MCP config flag if available
  const mcpConfigPath = await checkMcpConfig();
  if (mcpConfigPath) {
    console.log(`📡 Adding MCP config: ${mcpConfigPath}`);
    args.push('--mcp-config', mcpConfigPath);
  }
  
  // Add model for new sessions
  if (!resume) {
    args.push('--model', 'sonnet');
  }
  
  // Add permission mode if specified
  if (permissionMode && permissionMode !== 'default') {
    args.push('--permission-mode', permissionMode);
    console.log('🔒 Using permission mode:', permissionMode);
  }
  
  // Add tools settings flags
  // Don't use --dangerously-skip-permissions when in plan mode
  if (settings.skipPermissions && permissionMode !== 'plan') {
    args.push('--dangerously-skip-permissions');
    console.log('⚠️  Using --dangerously-skip-permissions (skipping other tool settings)');
  } else {
    // Only add allowed/disallowed tools if not skipping permissions
    
    // Collect all allowed tools, including plan mode defaults
    let allowedTools = [...(settings.allowedTools || [])];
    
    // Add plan mode specific tools
    if (permissionMode === 'plan') {
      const planModeTools = ['Read', 'Task', 'exit_plan_mode', 'TodoRead', 'TodoWrite'];
      // Add plan mode tools that aren't already in the allowed list
      for (const tool of planModeTools) {
        if (!allowedTools.includes(tool)) {
          allowedTools.push(tool);
        }
      }
      console.log('📝 Plan mode: Added default allowed tools:', planModeTools);
    }
    
    // Add allowed tools
    if (allowedTools.length > 0) {
      for (const tool of allowedTools) {
        args.push('--allowedTools', tool);
        console.log('✅ Allowing tool:', tool);
      }
    }
    
    // Add disallowed tools
    if (settings.disallowedTools && settings.disallowedTools.length > 0) {
      for (const tool of settings.disallowedTools) {
        args.push('--disallowedTools', tool);
        console.log('❌ Disallowing tool:', tool);
      }
    }
    
    // Log when skip permissions is disabled due to plan mode
    if (settings.skipPermissions && permissionMode === 'plan') {
      console.log('📝 Skip permissions disabled due to plan mode');
    }
  }
  
  return args;
}

/**
 * Spawn Claude CLI process and handle communication via WebSocket
 */
export async function spawnClaude(
  command: string | undefined,
  options: ClaudeSpawnOptions = {},
  ws: WebSocketInterface
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const { sessionId, cwd } = options;
    let capturedSessionId = sessionId; // Track session ID throughout the process
    let sessionCreatedSent = false; // Track if we've already sent session-created event
    
    // Use cwd (actual project directory) instead of projectPath (Claude's metadata directory)
    const workingDir = cwd || process.cwd();
    
    // Handle images by saving them to temporary files and passing paths to Claude
    const { tempImagePaths, tempDir } = await processImages(options.images, workingDir);
    
    // Build Claude CLI command arguments
    const args = await buildClaudeArgs(command, options, tempImagePaths);
    
    console.log('Spawning Claude CLI:', 'claude', args.map(arg => {
      const cleanArg = arg.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
      return cleanArg.includes(' ') ? `"${cleanArg}"` : cleanArg;
    }).join(' '));
    console.log('Working directory:', workingDir);
    console.log('Session info - Input sessionId:', sessionId, 'Resume:', options.resume);
    console.log('🔍 Full command args:', JSON.stringify(args, null, 2));
    console.log('🔍 Final Claude command will be: claude ' + args.join(' '));
    
    // Prepare ISOLATED environment variables for Claude CLI
    // Start with minimal system environment (excluding Claude-related vars)
    const claudeEnv: Record<string, string> = {};
    
    // Only inherit essential system variables
    const essentialVars = ['PATH', 'HOME', 'USER', 'SHELL', 'TERM', 'TMPDIR', 'LANG', 'LC_ALL'];
    for (const key of essentialVars) {
      if (process.env[key]) {
        claudeEnv[key] = process.env[key];
      }
    }

    // Get Claude environment variables from memory (NOT from system env)
    const claudeMemoryEnvVars = getClaudeEnvAsRecord();
    console.log('🔒 Using isolated Claude environment variables:', Object.keys(claudeMemoryEnvVars));
    
    // Apply Claude environment variables from memory
    Object.assign(claudeEnv, claudeMemoryEnvVars);

    // Apply custom environment variables from options (highest priority)
    if (options.env) {
      console.log('🔧 Applying custom env vars from options:', Object.keys(options.env));
      Object.assign(claudeEnv, options.env);
    }
    
    // Log the final environment (without sensitive values)
    const envKeys = Object.keys(claudeEnv).filter(k => k.startsWith('ANTHROPIC_'));
    console.log('🌍 Final Claude CLI environment keys:', envKeys);

    const claudeProcess = spawn('claude', args, {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: claudeEnv
    });
    
    // Store process reference for potential abort
    const processKey = capturedSessionId || sessionId || Date.now().toString();
    activeClaudeProcesses.set(processKey, claudeProcess);
    
    // Handle stdout (streaming JSON responses)
    claudeProcess.stdout.on('data', (data) => {
      const rawOutput = data.toString();
      console.log('📤 Claude CLI stdout:', rawOutput);
      
      const lines = rawOutput.split('\n').filter((line: string) => line.trim());
      
      for (const line of lines) {
        try {
          const response = JSON.parse(line);
          console.log('📄 Parsed JSON response:', response);
          
          // Capture session ID if it's in the response
          if (response.session_id && !capturedSessionId) {
            capturedSessionId = response.session_id;
            console.log('📝 Captured session ID:', capturedSessionId);
            
            // Update process key with captured session ID
            if (processKey !== capturedSessionId && capturedSessionId) {
              activeClaudeProcesses.delete(processKey);
              activeClaudeProcesses.set(capturedSessionId, claudeProcess);
            }
            
            // Send session-created event only once for new sessions
            if (!sessionId && !sessionCreatedSent) {
              sessionCreatedSent = true;
              ws.send(JSON.stringify({
                type: 'session-created',
                sessionId: capturedSessionId
              }));
            }
          }
          
          // Send parsed response to WebSocket
          ws.send(JSON.stringify({
            type: 'claude-response',
            data: response
          }));
        } catch (parseError) {
          console.log('📄 Non-JSON response:', line);
          // If not JSON, send as raw text
          ws.send(JSON.stringify({
            type: 'claude-output',
            data: line
          }));
        }
      }
    });
    
    // Handle stderr
    claudeProcess.stderr.on('data', (data) => {
      console.error('Claude CLI stderr:', data.toString());
      ws.send(JSON.stringify({
        type: 'claude-error',
        error: data.toString()
      }));
    });
    
    // Handle process completion
    claudeProcess.on('close', async (code) => {
      console.log(`Claude CLI process exited with code ${code}`);
      
      // Clean up process reference
      const finalSessionId = capturedSessionId || sessionId || processKey;
      activeClaudeProcesses.delete(finalSessionId);
      
      ws.send(JSON.stringify({
        type: 'claude-complete',
        exitCode: code,
        isNewSession: !sessionId && !!command // Flag to indicate this was a new session
      }));
      
      // Clean up temporary image files
      await cleanupTempFiles(tempImagePaths, tempDir);
      
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Claude CLI exited with code ${code}`));
      }
    });
    
    // Handle process errors
    claudeProcess.on('error', async (error) => {
      console.error('Claude CLI process error:', error);
      
      // Clean up process reference on error
      const finalSessionId = capturedSessionId || sessionId || processKey;
      activeClaudeProcesses.delete(finalSessionId);
      
      ws.send(JSON.stringify({
        type: 'claude-error',
        error: error.message
      }));
      
      // Clean up temporary image files on error
      await cleanupTempFiles(tempImagePaths, tempDir);
      
      reject(error);
    });
    
    // Handle stdin for interactive mode
    if (command) {
      // For --print mode with arguments, we don't need to write to stdin
      claudeProcess.stdin.end();
    } else {
      // For interactive mode, we need to write the command to stdin if provided later
      // Keep stdin open for interactive session
      if (command !== undefined) {
        claudeProcess.stdin.write(command + '\n');
        claudeProcess.stdin.end();
      }
      // If no command provided, stdin stays open for interactive use
    }
  });
}

/**
 * Abort a Claude CLI session by session ID
 */
export function abortClaudeSession(sessionId: string): boolean {
  const process = activeClaudeProcesses.get(sessionId);
  if (process) {
    console.log(`🛑 Aborting Claude session: ${sessionId}`);
    process.kill('SIGTERM');
    activeClaudeProcesses.delete(sessionId);
    return true;
  }
  return false;
}

/**
 * Get active Claude sessions information
 */
export function getActiveClaudeSessions() {
  const sessions = Array.from(activeClaudeProcesses.keys()).map(sessionId => {
    const process = activeClaudeProcesses.get(sessionId);
    return {
      sessionId,
      pid: process?.pid || null,
      status: process?.killed ? 'terminated' : 'active'
    };
  });

  return {
    total: sessions.length,
    sessions
  };
}