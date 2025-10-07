/**
 * PROJECT CONFIGURATION MANAGEMENT
 * =================================
 * 
 * Handles saving and loading manually added projects configuration
 */

import { readFile, writeFile, access, readdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

interface ProjectConfig {
  [projectName: string]: {
    manuallyAdded?: boolean;
    originalPath?: string;
    displayName?: string;
  };
}

const CONFIG_FILE = join(homedir(), '.claude', 'project-config.json');

/**
 * Load project configuration from config.json
 */
export async function loadProjectConfig(): Promise<ProjectConfig> {
  try {
    await access(CONFIG_FILE);
    const configData = await readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(configData);
  } catch (error) {
    // If file doesn't exist or is invalid, return empty config
    return {};
  }
}

/**
 * Save project configuration to project-config.json
 */
export async function saveProjectConfig(config: ProjectConfig): Promise<void> {
  try {
    const claudeDir = join(homedir(), '.claude');

    // Ensure the .claude directory exists
    try {
      await access(claudeDir);
    } catch (error) {
      const { mkdir } = await import('fs/promises');
      await mkdir(claudeDir, { recursive: true });
    }

    const configData = JSON.stringify(config, null, 2);
    await writeFile(CONFIG_FILE, configData, 'utf-8');
    console.log('✅ Project configuration saved');
  } catch (error) {
    console.error('❌ Error saving project configuration:', error);
    throw error;
  }
}

/**
 * Add a project manually to the config
 */
export async function addProjectManually(projectPath: string, displayName?: string): Promise<{
  name: string;
  path: string;
  fullPath: string;
  displayName: string;
  isManuallyAdded: boolean;
  isCustomName: boolean;
  sessions: any[];
  sessionMeta: { hasMore: boolean; total: number };
}> {
  // Resolve to absolute path
  const absolutePath = projectPath.startsWith('/') ? projectPath : join(process.cwd(), projectPath);
  
  try {
    // Check if the path exists
    await access(absolutePath);
  } catch (error) {
    throw new Error(`Path does not exist: ${absolutePath}`);
  }
  
  // Generate project name (encode path for use as directory name)
  const projectName = absolutePath.replace(/\//g, '-');
  
  // Check if project already exists in config
  const config = await loadProjectConfig();
  
  if (config[projectName]) {
    throw new Error(`Project already configured for path: ${absolutePath}`);
  }
  
  // Add to config as manually added project
  config[projectName] = {
    manuallyAdded: true,
    originalPath: absolutePath
  };
  
  if (displayName) {
    config[projectName].displayName = displayName;
  }
  
  await saveProjectConfig(config);
  
  // Generate display name
  const finalDisplayName = displayName || await generateDisplayName(projectName, absolutePath);
  
  console.log(`✅ Manually added project: ${finalDisplayName} (${absolutePath})`);
  
  return {
    name: projectName,
    path: absolutePath,
    fullPath: absolutePath,
    displayName: finalDisplayName,
    isManuallyAdded: true,
    isCustomName: !!displayName,
    sessions: [],
    sessionMeta: { hasMore: false, total: 0 }
  };
}

/**
 * Generate display name for a project (similar to projectDiscovery.ts)
 */
async function generateDisplayName(projectName: string, projectPath: string): Promise<string> {
  try {
    // Try to read package.json
    const packageJsonPath = join(projectPath, 'package.json');
    await access(packageJsonPath);
    
    const packageData = await readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageData);
    
    if (packageJson.name) {
      return packageJson.name;
    }
  } catch (error) {
    // package.json doesn't exist or is invalid, continue with fallback
  }
  
  // Fallback to directory name
  const pathParts = projectPath.split('/');
  return pathParts[pathParts.length - 1] || projectName;
}

/**
 * Get all manually added projects from config
 */
export async function getManuallyAddedProjects(): Promise<any[]> {
  const config = await loadProjectConfig();
  const projects: any[] = [];
  
  for (const [projectName, projectConfig] of Object.entries(config)) {
    if (projectConfig.manuallyAdded && projectConfig.originalPath) {
      try {
        // Check if path still exists
        await access(projectConfig.originalPath);
        
        const displayName = projectConfig.displayName || await generateDisplayName(projectName, projectConfig.originalPath);
        
        projects.push({
          name: projectName,
          path: projectConfig.originalPath,
          displayName,
          fullPath: projectConfig.originalPath,
          isCustomName: !!projectConfig.displayName,
          isManuallyAdded: true,
          sessions: [],
          sessionMeta: { hasMore: false, total: 0 }
        });
      } catch (error) {
        console.warn(`⚠️ Manually added project path no longer exists: ${projectConfig.originalPath}`);
      }
    }
  }
  
  return projects;
}

/**
 * Rename a project's display name
 */
export async function renameProject(projectName: string, newDisplayName: string): Promise<void> {
  const config = await loadProjectConfig();

  if (!newDisplayName || newDisplayName.trim() === '') {
    // Remove custom name if empty, will fall back to auto-generated
    delete config[projectName];
  } else {
    // Set custom display name
    config[projectName] = config[projectName] || {};
    config[projectName].displayName = newDisplayName.trim();
  }

  await saveProjectConfig(config);
  console.log(`✅ Project renamed: ${projectName} -> ${newDisplayName || 'auto-generated'}`);
}

/**
 * Check if a project is empty (has no sessions)
 */
export async function isProjectEmpty(projectName: string): Promise<boolean> {
  const projectPath = join(homedir(), '.claude', 'projects', projectName);

  try {
    await access(projectPath);
    const files = await readdir(projectPath);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

    // Check if any JSONL file has content
    for (const file of jsonlFiles) {
      const filePath = join(projectPath, file);
      const content = await readFile(filePath, 'utf-8');
      if (content.trim()) {
        return false; // Has sessions
      }
    }

    return true; // Empty or no JSONL files
  } catch (error) {
    // If directory doesn't exist, consider it empty
    return true;
  }
}

/**
 * Delete a project (following original server logic)
 */
export async function deleteProject(projectName: string): Promise<void> {
  const config = await loadProjectConfig();
  const projectDir = join(homedir(), '.claude', 'projects', projectName);

  try {
    // Check if project is empty
    const isEmpty = await isProjectEmpty(projectName);
    if (!isEmpty) {
      throw new Error('Cannot delete project with existing sessions');
    }

    // Try to remove physical directory if it exists
    try {
      await access(projectDir);
      // Directory exists, remove it
      const { rm } = await import('fs/promises');
      await rm(projectDir, { recursive: true, force: true });
      console.log(`🗑️ Removed project directory: ${projectDir}`);
    } catch (error) {
      // Directory doesn't exist, that's fine for manually added projects
      console.log(`📁 No physical directory to remove for: ${projectName}`);
    }

    // Remove from config if it exists
    if (config[projectName]) {
      delete config[projectName];
      await saveProjectConfig(config);
      console.log(`🗑️ Removed project from config: ${projectName}`);
    }

    console.log(`✅ Project deleted successfully: ${projectName}`);
  } catch (error) {
    console.error(`❌ Error deleting project ${projectName}:`, error);
    throw error;
  }
}
