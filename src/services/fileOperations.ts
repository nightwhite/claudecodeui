/**
 * FILE OPERATIONS SERVICE (Enhanced with Path Security)
 * =====================================================
 * 
 * Handles file reading, writing, and directory operations with support for:
 * - Relative paths (within project directory)
 * - Absolute paths (for system-wide access)
 * - Enhanced security validation
 */

import { readFile, writeFile, readdir, stat, access, copyFile } from 'fs/promises';
import { constants } from 'fs';
import { join, isAbsolute, resolve, normalize, relative } from 'path';
import * as mime from 'mime-types';
import { extractProjectDirectory } from './projectDiscovery.ts';

/**
 * Validate relative path for security
 */
function validateRelativePath(relativePath: string): boolean {
  // Prohibit path traversal
  if (relativePath.includes('..')) return false;
  
  // Prohibit absolute path characteristics
  if (relativePath.startsWith('/')) return false;
  
  // Prohibit Windows absolute paths
  if (/^[a-zA-Z]:/.test(relativePath)) return false;
  
  // Prohibit special characters that could be dangerous
  if (/[<>:"|?*]/.test(relativePath)) return false;
  
  return true;
}

/**
 * Resolve project file path - only accepts relative paths
 */
async function resolveProjectFilePath(
  projectName: string, 
  relativePath: string
): Promise<string> {
  console.log(`📁 Resolving project file: ${relativePath} for project: ${projectName}`);
  
  // Strict validation: must be relative path
  if (isAbsolute(relativePath)) {
    throw new Error('Project files must use relative paths.');
  }
  
  if (!validateRelativePath(relativePath)) {
    throw new Error('Invalid relative path - contains unsafe characters or path traversal');
  }
  
  const projectDir = await extractProjectDirectory(projectName);
  const finalPath = resolve(join(projectDir, relativePath));
  
  // Security check: ensure resolved path is still within project directory
  const relativeFinal = relative(projectDir, finalPath);
  if (relativeFinal.startsWith('..') || isAbsolute(relativeFinal)) {
    throw new Error('Invalid relative path - resolves outside project directory');
  }
  
  return finalPath;
}

/**
 * Resolve system file path - only accepts absolute paths
 */
function resolveSystemFilePath(absolutePath: string): string {
  console.log(`🌍 Resolving system file: ${absolutePath}`);
  
  // Strict validation: must be absolute path
  if (!isAbsolute(absolutePath)) {
    throw new Error('System files must use absolute paths.');
  }
  
  return normalize(absolutePath);
}

/**
 * Read project file content (relative path only)
 */
export async function readProjectFile(
  projectName: string, 
  relativePath: string
): Promise<{ content: string; path: string }> {
  console.log('📄 Project file read request:', { projectName, relativePath });

  const finalPath = await resolveProjectFilePath(projectName, relativePath);
  
  try {
    const content = await readFile(finalPath, 'utf8');
    console.log(`✅ Project file read successfully: ${finalPath}`);
    return { content, path: finalPath };
  } catch (error: any) {
    console.error('Error reading project file:', error);
    if (error.code === 'ENOENT') {
      throw new Error('File not found');
    } else if (error.code === 'EACCES') {
      throw new Error('Permission denied');
    } else {
      throw new Error(error.message);
    }
  }
}

/**
 * Read system file content (absolute path only)
 */
export async function readSystemFile(
  absolutePath: string
): Promise<{ content: string; path: string }> {
  console.log('🌍 System file read request:', { absolutePath });

  const finalPath = resolveSystemFilePath(absolutePath);
  
  try {
    const content = await readFile(finalPath, 'utf8');
    console.log(`✅ System file read successfully: ${finalPath}`);
    return { content, path: finalPath };
  } catch (error: any) {
    console.error('Error reading system file:', error);
    if (error.code === 'ENOENT') {
      throw new Error('File not found');
    } else if (error.code === 'EACCES') {
      throw new Error('Permission denied');
    } else {
      throw new Error(error.message);
    }
  }
}


/**
 * Save project file content (relative path only)
 */
export async function saveProjectFile(
  projectName: string,
  relativePath: string,
  content: string
): Promise<{ success: boolean; path: string; message: string }> {
  console.log('💾 Project file save request:', { projectName, relativePath });

  if (content === undefined) {
    throw new Error('Content is required');
  }

  const finalPath = await resolveProjectFilePath(projectName, relativePath);

  try {
    // Create backup of original file if it exists
    try {
      await access(finalPath);
      const backupPath = finalPath + '.backup.' + Date.now();
      await copyFile(finalPath, backupPath);
      console.log('📋 Created backup:', backupPath);
    } catch (backupError) {
      // File doesn't exist or can't create backup - not critical
      console.warn('Could not create backup:', (backupError as Error).message);
    }

    // Write the new content
    await writeFile(finalPath, content, 'utf8');

    console.log(`✅ Project file saved successfully: ${finalPath}`);
    return {
      success: true,
      path: finalPath,
      message: 'File saved successfully'
    };
  } catch (error: any) {
    console.error('Error saving project file:', error);
    if (error.code === 'ENOENT') {
      throw new Error('File or directory not found');
    } else if (error.code === 'EACCES') {
      throw new Error('Permission denied');
    } else {
      throw new Error(error.message);
    }
  }
}

/**
 * Save system file content (absolute path only)
 */
export async function saveSystemFile(
  absolutePath: string,
  content: string
): Promise<{ success: boolean; path: string; message: string }> {
  console.log('🌍 System file save request:', { absolutePath });

  if (content === undefined) {
    throw new Error('Content is required');
  }

  const finalPath = resolveSystemFilePath(absolutePath);

  try {
    // Create backup of original file if it exists
    try {
      await access(finalPath);
      const backupPath = finalPath + '.backup.' + Date.now();
      await copyFile(finalPath, backupPath);
      console.log('📋 Created backup:', backupPath);
    } catch (backupError) {
      // File doesn't exist or can't create backup - not critical
      console.warn('Could not create backup:', (backupError as Error).message);
    }

    // Write the new content
    await writeFile(finalPath, content, 'utf8');

    console.log(`✅ System file saved successfully: ${finalPath}`);
    return {
      success: true,
      path: finalPath,
      message: 'File saved successfully'
    };
  } catch (error: any) {
    console.error('Error saving system file:', error);
    if (error.code === 'ENOENT') {
      throw new Error('File or directory not found');
    } else if (error.code === 'EACCES') {
      throw new Error('Permission denied');
    } else {
      throw new Error(error.message);
    }
  }
}


/**
 * Get file tree structure
 */
interface FileTreeItem {
  name: string;
  path: string;
  type: 'directory' | 'file';
  size: number;
  modified: string | null;
  permissions: string;
  permissionsRwx: string;
  children?: FileTreeItem[];
}

// Helper function to convert permissions to rwx format
function permToRwx(perm: number): string {
  const r = perm & 4 ? 'r' : '-';
  const w = perm & 2 ? 'w' : '-';
  const x = perm & 1 ? 'x' : '-';
  return r + w + x;
}

async function buildFileTree(dirPath: string, maxDepth: number = 3, currentDepth: number = 0, showHidden: boolean = true): Promise<FileTreeItem[]> {
  const items: FileTreeItem[] = [];

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      // Skip heavy build directories
      if (entry.name === 'node_modules' ||
          entry.name === 'dist' ||
          entry.name === 'build') continue;

      const itemPath = join(dirPath, entry.name);
      const item: FileTreeItem = {
        name: entry.name,
        path: itemPath,
        type: entry.isDirectory() ? 'directory' : 'file',
        size: 0,
        modified: null,
        permissions: '000',
        permissionsRwx: '---------'
      };

      // Get file stats for additional metadata
      try {
        const stats = await stat(itemPath);
        item.size = stats.size;
        item.modified = stats.mtime.toISOString();

        // Convert permissions to rwx format
        const mode = stats.mode;
        const ownerPerm = (mode >> 6) & 7;
        const groupPerm = (mode >> 3) & 7;
        const otherPerm = mode & 7;
        item.permissions = ownerPerm.toString() + groupPerm.toString() + otherPerm.toString();
        item.permissionsRwx = permToRwx(ownerPerm) + permToRwx(groupPerm) + permToRwx(otherPerm);
      } catch (statError) {
        // If stat fails, keep default values
        console.warn('Could not stat file:', itemPath, (statError as Error).message);
      }

      if (entry.isDirectory() && currentDepth < maxDepth) {
        // Recursively get subdirectories but limit depth
        try {
          // Check if we can access the directory before trying to read it
          await access(item.path, constants.R_OK);
          item.children = await buildFileTree(item.path, maxDepth, currentDepth + 1, showHidden);
        } catch (e) {
          // Silently skip directories we can't access (permission denied, etc.)
          item.children = [];
        }
      }

      items.push(item);
    }
  } catch (error: any) {
    // Only log non-permission errors to avoid spam
    if (error.code !== 'EACCES' && error.code !== 'EPERM') {
      console.error('Error reading directory:', error);
    }
  }

  return items.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

export async function getProjectFileTree(projectName: string): Promise<FileTreeItem[]> {
  // Use extractProjectDirectory to get the actual project path
  let actualPath: string;
  try {
    actualPath = await extractProjectDirectory(projectName);
  } catch (error) {
    console.error('Error extracting project directory:', error);
    // Fallback to simple dash replacement
    actualPath = projectName.replace(/-/g, '/');
  }

  // Check if path exists
  try {
    await access(actualPath);
  } catch (e) {
    throw new Error(`Project path not found: ${actualPath}`);
  }

  const files = await buildFileTree(actualPath, 3, 0, true);
  return files;
}

/**
 * Get MIME type for file
 */
export function getMimeType(filePath: string): string {
  return mime.lookup(filePath) || 'application/octet-stream';
}

/**
 * Check if file exists and is accessible
 */
export async function checkFileAccess(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Serve project binary file (relative path only)
 */
export async function serveProjectBinaryFile(
  projectName: string, 
  relativePath: string
): Promise<{ file: Blob; mimeType: string; path: string }> {
  console.log('🖼️ Project binary file serve request:', { projectName, relativePath });

  const finalPath = await resolveProjectFilePath(projectName, relativePath);

  // Check if file exists
  const exists = await checkFileAccess(finalPath);
  if (!exists) {
    throw new Error('File not found');
  }

  try {
    // Read file as buffer
    const buffer = await readFile(finalPath);
    
    // Get MIME type
    const mimeType = getMimeType(finalPath);
    
    // Create Blob from buffer
    const file = new Blob([buffer], { type: mimeType });
    
    console.log(`✅ Project binary file served successfully: ${finalPath} (${mimeType})`);
    return { file, mimeType, path: finalPath };
  } catch (error: any) {
    console.error('Error serving project binary file:', error);
    throw new Error('Error reading file');
  }
}

/**
 * Serve system binary file (absolute path only)
 */
export async function serveSystemBinaryFile(
  absolutePath: string
): Promise<{ file: Blob; mimeType: string; path: string }> {
  console.log('🌍 System binary file serve request:', { absolutePath });

  const finalPath = resolveSystemFilePath(absolutePath);

  // Check if file exists
  const exists = await checkFileAccess(finalPath);
  if (!exists) {
    throw new Error('File not found');
  }

  try {
    // Read file as buffer
    const buffer = await readFile(finalPath);
    
    // Get MIME type
    const mimeType = getMimeType(finalPath);
    
    // Create Blob from buffer
    const file = new Blob([buffer], { type: mimeType });
    
    console.log(`✅ System binary file served successfully: ${finalPath} (${mimeType})`);
    return { file, mimeType, path: finalPath };
  } catch (error: any) {
    console.error('Error serving system binary file:', error);
    throw new Error('Error reading file');
  }
}

