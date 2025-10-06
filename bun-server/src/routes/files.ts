/**
 * SYSTEM FILE ROUTES (Absolute Paths Only)
 * ========================================
 * 
 * Routes for handling system-wide file operations using absolute paths
 */

import { Elysia, t } from "elysia";
import { readSystemFile, saveSystemFile, serveSystemBinaryFile } from "../services/fileOperations.ts";

export default new Elysia()

  // Read system file content (absolute path only)
  .get("/", async ({ query, set }) => {

    try {
      const { filePath } = query as { filePath?: string };

      if (!filePath) {
        set.status = 400;
        return { error: 'filePath query parameter is required' };
      }

      const result = await readSystemFile(filePath);
      return { content: result.content, path: result.path };
    } catch (error) {
      console.error('❌ Error reading system file:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to read system file';
      
      if (errorMessage.includes('File not found')) {
        set.status = 404;
      } else if (errorMessage.includes('Permission denied')) {
        set.status = 403;
      } else if (errorMessage.includes('absolute paths') || errorMessage.includes('Invalid')) {
        set.status = 400;
      } else {
        set.status = 500;
      }
      
      return { error: errorMessage };
    }
  }, {
    query: t.Object({
      filePath: t.String()
    }),
    detail: {
      tags: ["System Files"],
      summary: "Read System File (Absolute Path Only)",
      description: "Read the content of a system file using absolute path. Relative paths are not allowed."
    }
  })

  // Save system file content (absolute path only)
  .put("/", async ({ body, set }) => {

    try {
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

      const result = await saveSystemFile(filePath, content);
      return { success: result.success, path: result.path, message: result.message };
    } catch (error) {
      console.error('❌ Error saving system file:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save system file';
      
      if (errorMessage.includes('not found')) {
        set.status = 404;
      } else if (errorMessage.includes('Permission denied')) {
        set.status = 403;
      } else if (errorMessage.includes('absolute paths') || errorMessage.includes('Invalid') || errorMessage.includes('Content is required')) {
        set.status = 400;
      } else {
        set.status = 500;
      }
      
      return { error: errorMessage };
    }
  }, {
    body: t.Object({
      filePath: t.String(),
      content: t.String()
    }),
    detail: {
      tags: ["System Files"],
      summary: "Save System File (Absolute Path Only)",
      description: "Save content to a system file using absolute path. Relative paths are not allowed."
    }
  })

  // Serve system binary file content (absolute path only)
  .get("/content", async ({ query, set }) => {

    try {
      const { filePath } = query as { filePath?: string };

      if (!filePath) {
        set.status = 400;
        return { error: 'filePath query parameter is required' };
      }

      const result = await serveSystemBinaryFile(filePath);

      // Set appropriate headers for binary content
      set.headers['Content-Type'] = result.mimeType;
      
      return result.file;
    } catch (error) {
      console.error('❌ Error serving system binary file:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to serve system binary file';
      
      if (errorMessage.includes('File not found')) {
        set.status = 404;
      } else if (errorMessage.includes('Permission denied')) {
        set.status = 403;
      } else if (errorMessage.includes('absolute paths') || errorMessage.includes('Invalid')) {
        set.status = 400;
      } else {
        set.status = 500;
      }
      
      return { error: errorMessage };
    }
  }, {
    query: t.Object({
      filePath: t.String()
    }),
    detail: {
      tags: ["System Files"],
      summary: "Serve System Binary File (Absolute Path Only)",
      description: "Serve binary file content (images, etc.) from system using absolute path. Relative paths are not allowed."
    }
  });