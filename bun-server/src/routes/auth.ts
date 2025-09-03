import { Elysia, t } from "elysia";
import { userDb } from "../database/db.ts";
import { hashPassword, verifyPassword, generateToken, jwtConfig } from "../middleware/auth.ts";

export default new Elysia()
  .use(jwtConfig)
  
  // Check current authentication status and setup requirements
  .get("/status", async ({ headers, jwt }) => {
    try {
      const hasUsers = userDb.hasUsers();
      let isAuthenticated = false;
      let user = null;

      // Check if user provided a token
      const authHeader = headers.authorization;
      const token = authHeader?.split(' ')[1];

      if (token) {
        try {
          const decoded = await jwt.verify(token);

          if (decoded && typeof decoded === 'object' && decoded.userId) {
            const userId = typeof decoded.userId === 'string' ? parseInt(decoded.userId) : decoded.userId;

            if (typeof userId === 'number' && !isNaN(userId)) {
              const foundUser = userDb.getUserById(userId) as any;

              if (foundUser) {
                isAuthenticated = true;
                user = {
                  id: foundUser.id,
                  username: foundUser.username
                };
              }
            }
          }
        } catch (tokenError: any) {
          // Token is invalid, but we don't throw error for status endpoint
          console.log('Invalid token in status check:', tokenError?.message || 'Unknown error');
        }
      }

      return {
        needsSetup: !hasUsers,
        isAuthenticated,
        ...(user && { user })
      };
    } catch (error) {
      console.error('Auth status error:', error);
      throw new Error('Internal server error');
    }
  }, {
    detail: {
      tags: ["Authentication"],
      summary: "Check Authentication Status",
      description: "Check current authentication status. Optionally provide Bearer token to verify authentication.",
      security: [{ BearerAuth: [] }, {}], // Optional authentication
      responses: {
        200: {
          description: "Authentication status retrieved successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  isAuthenticated: {
                    type: "boolean",
                    description: "Whether the provided token is valid"
                  },
                  user: {
                    type: "object",
                    nullable: true,
                    properties: {
                      id: { type: "number" },
                      username: { type: "string" }
                    },
                    description: "User information if authenticated"
                  }
                }
              }
            }
          }
        }
      }
    }
  })

  // User registration (setup) - only allowed if no users exist
  .post("/register", async ({ body, jwt, set }) => {
    try {
      const { username, password } = body as { username: string; password: string };
      
      // Validate input
      if (!username || !password) {
        set.status = 400;
        return { error: 'Username and password are required' };
      }
      
      if (username.length < 3 || password.length < 6) {
        set.status = 400;
        return { error: 'Username must be at least 3 characters, password at least 6 characters' };
      }
      
      // Check if users already exist (only allow one user)
      const hasUsers = userDb.hasUsers();
      if (hasUsers) {
        set.status = 403;
        return { error: 'User already exists. This is a single-user system.' };
      }
      
      // Hash password
      const saltRounds = 12;
      const passwordHash = await hashPassword(password);
      
      // Create user
      const user = userDb.createUser(username, passwordHash);
      
      // Generate token
      const token = await generateToken(user, jwt);
      
      // Update last login
      userDb.updateLastLogin(user.id);
      
      return {
        success: true,
        user: { id: user.id, username: user.username },
        token
      };
      
    } catch (error: any) {
      console.error('Registration error:', error);
      if (error.message?.includes('UNIQUE constraint failed')) {
        set.status = 409;
        return { error: 'Username already exists' };
      } else {
        set.status = 500;
        return { error: 'Internal server error' };
      }
    }
  }, {
    body: t.Object({
      username: t.String({ minLength: 1 }),
      password: t.String({ minLength: 6 })
    }),
    detail: {
      tags: ["Authentication"],
      summary: "Register New User",
      description: "Register a new user with unique username"
    }
  })

  // User login
  .post("/login", async ({ body, jwt, set }) => {
    try {
      const { username, password } = body as { username: string; password: string };
      
      // Validate input
      if (!username || !password) {
        set.status = 400;
        return { error: 'Username and password are required' };
      }
      
      // Get user from database
      const user = userDb.getUserByUsername(username) as any;
      if (!user) {
        set.status = 401;
        return { error: 'Invalid username or password' };
      }
      
      // Verify password
      const isValidPassword = await verifyPassword(password, user.password_hash);
      if (!isValidPassword) {
        set.status = 401;
        return { error: 'Invalid username or password' };
      }
      
      // Generate token
      const token = await generateToken(user, jwt);
      
      // Update last login
      userDb.updateLastLogin(user.id);
      
      return {
        success: true,
        user: { id: user.id, username: user.username },
        token
      };
      
    } catch (error) {
      console.error('Login error:', error);
      set.status = 500;
      return { error: 'Internal server error' };
    }
  }, {
    body: t.Object({
      username: t.String({ minLength: 1 }),
      password: t.String({ minLength: 1 })
    }),
    detail: {
      tags: ["Authentication"],
      summary: "User Login",
      description: "Authenticate user and return JWT token"
    }
  })

  // Get current user (protected route)
  .get("/user", async ({ headers, jwt, set }) => {
    const authHeader = headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      set.status = 401;
      return { error: 'Access denied. No token provided.' };
    }

    try {
      const decoded = await jwt.verify(token);

      if (!decoded || typeof decoded !== 'object' || !decoded.userId) {
        set.status = 403;
        return { error: 'Invalid token format' };
      }

      const userId = typeof decoded.userId === 'string' ? parseInt(decoded.userId) : decoded.userId;
      if (typeof userId !== 'number' || isNaN(userId)) {
        set.status = 403;
        return { error: 'Invalid user ID in token' };
      }

      const user = userDb.getUserById(userId);

      if (!user) {
        set.status = 401;
        return { error: 'Invalid token. User not found.' };
      }

      return { user };
    } catch (error) {
      console.error('Token verification error:', error);
      set.status = 403;
      return { error: 'Invalid token' };
    }
  }, {
    detail: {
      tags: ["Authentication"],
      summary: "Get Current User",
      description: "Get current authenticated user information",
      security: [{ BearerAuth: [] }]
    }
  })

  // Logout (client-side token removal, but this endpoint can be used for logging)
  .post("/logout", async ({ headers, jwt, set }) => {
    const authHeader = headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      set.status = 401;
      return { error: 'Access denied. No token provided.' };
    }

    try {
      const decoded = await jwt.verify(token);
      if (!decoded || typeof decoded !== 'object' || !decoded.userId) {
        set.status = 403;
        return { error: 'Invalid token' };
      }
      
      // In a simple JWT system, logout is mainly client-side
      // This endpoint exists for consistency and potential future logging
      return { success: true, message: 'Logged out successfully' };
    } catch (error) {
      console.error('Logout token verification error:', error);
      set.status = 403;
      return { error: 'Invalid token' };
    }
  }, {
    detail: {
      tags: ["Authentication"],
      summary: "User Logout",
      description: "Logout user (mainly client-side token removal)",
      security: [{ BearerAuth: [] }]
    }
  });
