import { jwt } from '@elysiajs/jwt';
import { userDb } from '../database/db.ts';
import bcrypt from 'bcryptjs';

// Get JWT secret from environment or use default (for development)
export const JWT_SECRET = process.env.JWT_SECRET || 'claude-ui-dev-secret-change-in-production';

// JWT configuration for Elysia
export const jwtConfig = jwt({
  name: 'jwt',
  secret: JWT_SECRET
});

// Password hashing utilities
export const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return await bcrypt.compare(password, hash);
};

// Generate JWT token
export const generateToken = async (user: { id: number; username: string }, jwt: any) => {
  return await jwt.sign({
    userId: user.id,
    username: user.username
  });
};

// Verify JWT token
export const verifyToken = async (token: string, jwt: any) => {
  try {
    return await jwt.verify(token);
  } catch (error) {
    return null;
  }
};

// Authentication guard for routes
export const authGuard = async ({ jwt, headers, set }: any) => {
  const authHeader = headers.authorization;
  const token = authHeader?.split(' ')[1]; // Bearer TOKEN

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

    // Verify user still exists and is active
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
};

// API Key validation middleware
export const validateApiKey = ({ headers, set }: any) => {
  // Skip API key validation if not configured
  if (!process.env.API_KEY) {
    return;
  }
  
  const apiKey = headers['x-api-key'];
  if (apiKey !== process.env.API_KEY) {
    set.status = 401;
    return { error: 'Invalid API key' };
  }
};

// WebSocket authentication function
export const authenticateWebSocket = (token: string) => {
  if (!token) {
    return null;
  }
  
  try {
    // For WebSocket, we use jsonwebtoken directly since Elysia's JWT plugin is for HTTP routes
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (error) {
    console.error('WebSocket token verification error:', error);
    return null;
  }
};
