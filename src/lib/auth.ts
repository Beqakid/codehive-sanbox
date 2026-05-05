import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import pool from './db';
import { RegisterDto, LoginDto, User } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'changeme-super-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const SALT_ROUNDS = 12;

export interface JwtPayload {
  userId: string;
  email: string;
  username: string;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export async function registerUser(dto: RegisterDto): Promise<Omit<User, 'password_hash'>> {
  const { username, email, password } = dto;

  if (!username || !email || !password) {
    throw new Error('Username, email, and password are required');
  }

  if (username.length < 3 || username.length > 50) {
    throw new Error('Username must be between 3 and 50 characters');
  }

  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error('Invalid email format');
  }

  const existingUser = await pool.query(
    'SELECT id FROM users WHERE email = $1 OR username = $2',
    [email.toLowerCase(), username.toLowerCase()]
  );

  if (existingUser.rows.length > 0) {
    throw new Error('A user with that email or username already exists');
  }

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

  const result = await pool.query<User>(
    `INSERT INTO users (username, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, username, email, created_at`,
    [username.toLowerCase(), email.toLowerCase(), password_hash]
  );

  const user = result.rows[0];
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    created_at: user.created_at,
  };
}

export async function loginUser(dto: LoginDto): Promise<{ token: string; user: Omit<User, 'password_hash'> }> {
  const { email, password } = dto;

  if (!email || !password) {
    throw new Error('Email and password are required');
  }

  const result = await pool.query<User>(
    'SELECT * FROM users WHERE email = $1',
    [email.toLowerCase()]
  );

  if (result.rows.length === 0) {
    throw new Error('Invalid email or password');
  }

  const user = result.rows[0];

  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) {
    throw new Error('Invalid email or password');
  }

  const payload: JwtPayload = {
    userId: user.id,
    email: user.email,
    username: user.username,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      created_at: user.created_at,
    },
  };
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    return decoded;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new Error('Token has expired');
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid token');
    }
    throw new Error('Token verification failed');
  }
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: 'Authorization header is missing' });
    return;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    res.status(401).json({ error: 'Authorization header must be in format: Bearer <token>' });
    return;
  }

  const token = parts[1];

  if (!token) {
    res.status(401).json({ error: 'Token is missing' });
    return;
  }

  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Authentication failed';
    res.status(401).json({ error: message });
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePasswords(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}