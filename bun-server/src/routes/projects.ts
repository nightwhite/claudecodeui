import { Elysia, t } from "elysia";
import { authGuard, jwtConfig } from "../middleware/auth.ts";
import { discoverProjects } from "../services/projectDiscovery.ts";
import {
  getClaudeSessions,
  getClaudeSessionMessages,
  deleteSession
} from "../services/sessionManagerNew.ts";
import { addProjectManually, deleteProject, renameProject } from "../services/projectConfig.ts";
import { readProjectFile, saveProjectFile, getProjectFileTree, serveProjectBinaryFile } from "../services/fileOperations.ts";

export default new Elysia()
  .use(jwtConfig)
  // Get all projects
  .get("/", async ({ headers, jwt, set }) => {
    // Apply auth guard
    const authResult = await authGuard({ jwt, headers, set });
    if (authResult.error) return authResult;

    try {
      console.log('📋 Fetching projects...');
      const projects = await discoverProjects();
      console.log(`✅ Retrieved ${projects.length} projects`);

      return projects;
    } catch (error) {
      console.error('❌ Error fetching projects:', error);
      set.status = 500;
      return { error: 'Failed to fetch projects' };
    }
  }, {
    detail: {
      tags: ["Projects"],
      summary: "Get All Projects",
      description: "Retrieve all Claude and Cursor projects from ~/.claude/projects/ and manually added projects"
    }
  })

  // Get project sessions
  .get("/:projectName/sessions", async ({ params, query, headers, jwt, set }) => {
    const authResult = await authGuard({ jwt, headers, set });
    if (authResult.error) return authResult;

    try {
      const { projectName } = params;
      const { limit = "5", offset = "0" } = query;

      const limitNum = parseInt(limit);
      const offsetNum = parseInt(offset);

      console.log(`📋 Fetching Claude sessions for project: ${projectName}`);

      const result = await getClaudeSessions(projectName, limitNum, offsetNum);
      console.log(`✅ Retrieved ${result.sessions.length} Claude sessions`);
      return result;
    } catch (error) {
      console.error('❌ Error fetching sessions:', error);
      set.status = 500;
      return { error: 'Failed to fetch sessions' };
    }
  }, {
    params: t.Object({
      projectName: t.String()
    }),
    query: t.Object({
      limit: t.Optional(t.String()),
      offset: t.Optional(t.String()),
      type: t.Optional(t.String())
    }),
    detail: {
      tags: ["Projects"],
      summary: "Get Project Sessions",
      description: "Retrieve Claude or Cursor sessions for a specific project"
    }
  })

  // Get session messages
  .get("/:projectName/sessions/:sessionId/messages", async ({ params, query, headers, jwt, set }) => {
    const authResult = await authGuard({ jwt, headers, set });
    if (authResult.error) return authResult;

    try {
      const { projectName, sessionId } = params;
      const { limit = "50", offset = "0" } = query;

      const limitNum = limit ? parseInt(limit) : null;
      const offsetNum = parseInt(offset);

      console.log(`📋 Fetching Claude messages for session: ${sessionId} in project: ${projectName}`);

      const result = await getClaudeSessionMessages(projectName, sessionId, limitNum, offsetNum);

      // Handle both return types (array for backward compatibility, object for pagination)
      if (Array.isArray(result)) {
        console.log(`✅ Retrieved ${result.length} Claude messages (all)`);
        return result;
      } else {
        console.log(`✅ Retrieved ${result.messages.length} Claude messages (paginated)`);
        return result;
      }
    } catch (error) {
      console.error('❌ Error fetching messages:', error);
      set.status = 500;
      return { error: 'Failed to fetch messages' };
    }
  }, {
    params: t.Object({
      projectName: t.String(),
      sessionId: t.String()
    }),
    query: t.Object({
      limit: t.Optional(t.String()),
      offset: t.Optional(t.String()),
      type: t.Optional(t.String())
    }),
    detail: {
      tags: ["Projects"],
      summary: "Get Session Messages",
      description: "Retrieve Claude or Cursor messages for a specific session"
    }
  })

  // Create new project
  .post("/create", async ({ body, headers, jwt, set }) => {
    const authResult = await authGuard({ jwt, headers, set });
    if (authResult.error) return authResult;

    try {
      const { path: projectPath } = body as { path: string };

      if (!projectPath || !projectPath.trim()) {
        set.status = 400;
        return { error: 'Project path is required' };
      }

      console.log(`📁 Creating project for path: ${projectPath}`);

      const project = await addProjectManually(projectPath.trim());

      console.log(`✅ Project created: ${project.displayName}`);
      return { success: true, project };
    } catch (error) {
      console.error('❌ Error creating project:', error);
      set.status = 500;
      return { error: error instanceof Error ? error.message : 'Failed to create project' };
    }
  }, {
    body: t.Object({
      path: t.String({ minLength: 1 })
    }),
    detail: {
      tags: ["Projects"],
      summary: "Create New Project",
      description: "Create a new project manually"
    }
  })

  // Rename project
  .put("/:projectName/rename", async ({ params, body, headers, jwt, set }) => {
    const authResult = await authGuard({ jwt, headers, set });
    if (authResult.error) return authResult;

    try {
      const { projectName } = params;
      const { displayName } = body as { displayName: string };

      console.log(`✏️ Renaming project: ${projectName} to ${displayName}`);

      await renameProject(projectName, displayName);

      console.log(`✅ Project renamed successfully: ${projectName} -> ${displayName}`);
      return { success: true };
    } catch (error) {
      console.error('❌ Error renaming project:', error);
      set.status = 500;
      return { error: error instanceof Error ? error.message : 'Failed to rename project' };
    }
  }, {
    params: t.Object({
      projectName: t.String()
    }),
    body: t.Object({
      displayName: t.String({ minLength: 1 })
    }),
    detail: {
      tags: ["Projects"],
      summary: "Rename Project",
      description: "Rename a project's display name"
    }
  })

  // Delete session
  .delete("/:projectName/sessions/:sessionId", async ({ params, headers, jwt, set }) => {
    const authResult = await authGuard({ jwt, headers, set });
    if (authResult.error) return authResult;

    try {
      const { projectName, sessionId } = params;

      console.log(`🗑️ Deleting session: ${sessionId} from project: ${projectName}`);

      await deleteSession(projectName, sessionId);

      console.log(`✅ Session deleted successfully: ${sessionId}`);
      return { success: true };
    } catch (error) {
      console.error('❌ Error deleting session:', error);
      set.status = 500;
      return { error: error instanceof Error ? error.message : 'Failed to delete session' };
    }
  }, {
    params: t.Object({
      projectName: t.String(),
      sessionId: t.String()
    }),
    detail: {
      tags: ["Projects"],
      summary: "Delete Session",
      description: "Delete a specific session from a project"
    }
  })

  // Delete project
  .delete("/:projectName", async ({ params, headers, jwt, set }) => {
    const authResult = await authGuard({ jwt, headers, set });
    if (authResult.error) return authResult;

    try {
      const { projectName } = params;

      console.log(`🗑️ Deleting project: ${projectName}`);

      await deleteProject(projectName);

      console.log(`✅ Project deleted successfully: ${projectName}`);
      return { success: true };
    } catch (error) {
      console.error('❌ Error deleting project:', error);
      set.status = 500;
      return { error: error instanceof Error ? error.message : 'Failed to delete project' };
    }
  }, {
    params: t.Object({
      projectName: t.String()
    }),
    detail: {
      tags: ["Projects"],
      summary: "Delete Project",
      description: "Delete an empty project (only if it has no sessions)"
    }
  })

  // Read project file content (relative path only)
  .get("/:projectName/file", async ({ params, query, headers, jwt, set }) => {
    const authResult = await authGuard({ jwt, headers, set });
    if (authResult.error) return authResult;

    try {
      const { projectName } = params;
      const { filePath } = query as { filePath?: string };

      if (!filePath) {
        set.status = 400;
        return { error: 'filePath query parameter is required' };
      }

      const result = await readProjectFile(projectName, filePath);
      return { content: result.content, path: result.path };
    } catch (error) {
      console.error('❌ Error reading project file:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to read file';
      
      if (errorMessage.includes('File not found')) {
        set.status = 404;
      } else if (errorMessage.includes('Permission denied')) {
        set.status = 403;
      } else if (errorMessage.includes('relative paths') || errorMessage.includes('Invalid') || errorMessage.includes('unsafe')) {
        set.status = 400;
      } else {
        set.status = 500;
      }
      
      return { error: errorMessage };
    }
  }, {
    params: t.Object({
      projectName: t.String()
    }),
    query: t.Object({
      filePath: t.String()
    }),
    detail: {
      tags: ["Projects"],
      summary: "Read Project File (Relative Path Only)",
      description: "Read the content of a file within a project using relative path. Absolute paths are not allowed."
    }
  })

  // Save project file content (relative path only)
  .put("/:projectName/file", async ({ params, body, headers, jwt, set }) => {
    const authResult = await authGuard({ jwt, headers, set });
    if (authResult.error) return authResult;

    try {
      const { projectName } = params;
      const { filePath, content } = body as { 
        filePath: string;
        content: string;
      };

      if (!content && content !== '') {
        set.status = 400;
        return { error: 'Content is required' };
      }

      if (!filePath) {
        set.status = 400;
        return { error: 'filePath is required' };
      }

      const result = await saveProjectFile(projectName, filePath, content);
      return { success: result.success, path: result.path, message: result.message };
    } catch (error) {
      console.error('❌ Error saving project file:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save file';
      
      if (errorMessage.includes('not found')) {
        set.status = 404;
      } else if (errorMessage.includes('Permission denied')) {
        set.status = 403;
      } else if (errorMessage.includes('relative paths') || errorMessage.includes('Invalid') || errorMessage.includes('unsafe') || errorMessage.includes('Content is required')) {
        set.status = 400;
      } else {
        set.status = 500;
      }
      
      return { error: errorMessage };
    }
  }, {
    params: t.Object({
      projectName: t.String()
    }),
    body: t.Object({
      filePath: t.String(),
      content: t.String()
    }),
    detail: {
      tags: ["Projects"],
      summary: "Save Project File (Relative Path Only)",
      description: "Save content to a file within a project using relative path. Absolute paths are not allowed."
    }
  })

  // Get project file tree
  .get("/:projectName/files", async ({ params, headers, jwt, set }) => {
    const authResult = await authGuard({ jwt, headers, set });
    if (authResult.error) return authResult;

    try {
      const { projectName } = params;

      console.log(`📁 Getting file tree for project: ${projectName}`);

      const files = await getProjectFileTree(projectName);

      console.log(`✅ Retrieved file tree with ${files.length} items for project: ${projectName}`);
      return files;
    } catch (error) {
      console.error('❌ Error getting file tree:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to get file tree';
      
      if (errorMessage.includes('Project path not found')) {
        set.status = 404;
      } else {
        set.status = 500;
      }
      
      return { error: errorMessage };
    }
  }, {
    params: t.Object({
      projectName: t.String()
    }),
    detail: {
      tags: ["Projects"],
      summary: "Get Project File Tree",
      description: "Get the file tree structure for a project"
    }
  })

  // Serve project binary file content (relative path only)
  .get("/:projectName/files/content", async ({ params, query, headers, jwt, set }) => {
    const authResult = await authGuard({ jwt, headers, set });
    if (authResult.error) return authResult;

    try {
      const { projectName } = params;
      const { filePath } = query as { filePath?: string };

      if (!filePath) {
        set.status = 400;
        return { error: 'filePath query parameter is required' };
      }

      const result = await serveProjectBinaryFile(projectName, filePath);

      // Set appropriate headers for binary content
      set.headers['Content-Type'] = result.mimeType;
      
      return result.file;
    } catch (error) {
      console.error('❌ Error serving project binary file:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to serve binary file';
      
      if (errorMessage.includes('File not found')) {
        set.status = 404;
      } else if (errorMessage.includes('Permission denied')) {
        set.status = 403;
      } else if (errorMessage.includes('relative paths') || errorMessage.includes('Invalid') || errorMessage.includes('unsafe')) {
        set.status = 400;
      } else {
        set.status = 500;
      }
      
      return { error: errorMessage };
    }
  }, {
    params: t.Object({
      projectName: t.String()
    }),
    query: t.Object({
      filePath: t.String()
    }),
    detail: {
      tags: ["Projects"],
      summary: "Serve Project Binary File (Relative Path Only)",
      description: "Serve binary file content (images, etc.) within a project using relative path. Absolute paths are not allowed."
    }
  })

  // Upload images to project  
  .post("/:projectName/upload-images", async ({ params, request, headers, jwt, set }) => {
    const authResult = await authGuard({ jwt, headers, set });
    if (authResult.error) return authResult;

    try {
      const { projectName } = params;
      
      // Parse multipart form data from request
      const formData = await request.formData();
      
      // Get uploaded files from FormData
      const files: File[] = [];
      
      // Handle both single file and multiple files
      const imageEntries = formData.getAll('images');
      for (const entry of imageEntries) {
        if (entry instanceof File) {
          files.push(entry);
        }
      }
      
      // Also check for single 'image' field
      const singleImage = formData.get('image');
      if (singleImage instanceof File) {
        files.push(singleImage);
      }
      
      if (!files || files.length === 0) {
        set.status = 400;
        return { error: 'No image files provided' };
      }

      if (files.length > 5) {
        set.status = 400;
        return { error: 'Maximum 5 images allowed' };
      }

      // Validate file types and sizes
      const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
      const maxFileSize = 5 * 1024 * 1024; // 5MB

      for (const file of files) {
        if (!allowedMimes.includes(file.type)) {
          set.status = 400;
          return { error: `Invalid file type: ${file.type}. Only JPEG, PNG, GIF, WebP, and SVG are allowed.` };
        }
        
        if (file.size > maxFileSize) {
          set.status = 400;
          return { error: `File too large: ${file.name}. Maximum size is 5MB.` };
        }
      }

      // Process uploaded images
      const processedImages = await Promise.all(
        files.map(async (file) => {
          try {
            // Read file content
            const arrayBuffer = await file.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            
            // Convert to base64
            const base64 = buffer.toString('base64');
            const mimeType = file.type;

            return {
              name: file.name,
              data: `data:${mimeType};base64,${base64}`,
              size: file.size,
              mimeType: mimeType
            };
          } catch (error) {
            console.error(`Error processing file ${file.name}:`, error);
            throw new Error(`Failed to process file: ${file.name}`);
          }
        })
      );

      console.log(`✅ Processed ${processedImages.length} images for project: ${projectName}`);
      return { images: processedImages };

    } catch (error) {
      console.error('❌ Error in image upload:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload images';
      
      set.status = 500;
      return { error: errorMessage };
    }
  }, {
    params: t.Object({
      projectName: t.String()
    }),
    type: 'multipart/form-data',
    detail: {
      tags: ["Projects"],
      summary: "Upload Images to Project",
      description: "Upload images (JPEG, PNG, GIF, WebP, SVG) to a project. Maximum 5 images, 5MB each. Use 'images' field for multiple files or 'image' for single file."
    }
  });
