import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: {
    username: string;
  };
}

export function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    res.status(401).json({
      success: false,
      error: 'Access denied. No token provided.',
    });
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({
      success: false,
      error: 'Internal server error. JWT secret not configured.',
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, secret) as { username: string };
    req.user = { username: decoded.username };
    next();
  } catch (err) {
    // Return 403 for any token verification failure (expired, invalid, malformed)
    res.status(403).json({
      success: false,
      error: 'Invalid or expired token.',
    });
  }
}
