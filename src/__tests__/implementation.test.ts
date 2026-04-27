import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import { hash as bcryptHash, compare as bcryptCompare } from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

// Mocks
jest.mock('bcryptjs');
jest.mock('../services/authService');
jest.mock('../services/tokenService');
jest.mock('../repositories/userRepository');
jest.mock('../repositories/tokenRepository');
jest.mock('jsonwebtoken');
jest.mock('uuid');

import * as AuthService from '../services/authService';
import * as TokenService from '../services/tokenService';
import * as UserRepository from '../repositories/userRepository';
import * as TokenRepository from '../repositories/tokenRepository';
import { authMiddleware } from '../middleware/authMiddleware';

const app = express();
app.use(express.json());

// Mock user
const mockUser = {
  id: 'user-uuid',
  email: 'test@example.com',
  passwordHash: '$hashed',
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Mock refresh token
const mockRefreshToken = {
  id: 'refresh-uuid',
  token: 'hashed-token',
  userId: 'user-uuid',
  user: mockUser,
  family: 'family-uuid',
  isRevoked: false,
  expiresAt: new Date(Date.now() + 3600000),
  createdAt: new Date(),
};

const mockAccessToken = 'jwt-access-token';
const mockRefreshTokenValue = 'jwt-refresh-token';

// Setup routes for tests
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const user = await AuthService.register(req.body.email, req.body.password);
    res.status(201).json({ user });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const result = await AuthService.login(req.body.email, req.body.password);
    res.status(200).json(result);
  } catch (e) {
    res.status(401).json({ error: (e as Error).message });
  }
});

app.post('/api/auth/refresh', async (req: Request, res: Response) => {
  try {
    const result = await AuthService.rotateRefreshToken(req.body.refreshToken);
    res.status(200).json(result);
  } catch (e) {
    res.status(401).json({ error: (e as Error).message });
  }
});

app.get('/api/user/me', authMiddleware, async (req: Request, res: Response) => {
  res.json({ user: (req as any).user });
});

describe('Auth Microservice Core Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (uuidv4 as jest.Mock).mockReturnValue('uuid-mock');
  });

  describe('User Registration', () => {
    it('registers user with unique email, stores hashed password', async () => {
      (AuthService.register as jest.Mock).mockImplementation(async (email, password) => ({
        ...mockUser,
        email,
      }));
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'user1@test.com', password: 'SecureP@ssw0rd' });
      expect(res.status).toBe(201);
      expect(res.body.user.email).toBe('user1@test.com');
      expect(AuthService.register).toBeCalledWith('user1@test.com', 'SecureP@ssw0rd');
    });

    it('returns error if email already exists', async () => {
      (AuthService.register as jest.Mock).mockRejectedValue(new Error('Email already in use'));
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'foo' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Email already in use');
    });
  });

  describe('User Login', () => {
    it('logs in valid user and returns tokens', async () => {
      (AuthService.login as jest.Mock).mockResolvedValue({
        user: mockUser,
        accessToken: mockAccessToken,
        refreshToken: mockRefreshTokenValue,
      });
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: mockUser.email, password: 'MySecret123' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body).toHaveProperty('user');
      expect(AuthService.login).toBeCalledWith(mockUser.email, 'MySecret123');
    });

    it('rejects invalid credentials', async () => {
      (AuthService.login as jest.Mock).mockRejectedValue(new Error('Invalid email or password'));
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: mockUser.email, password: 'wrongpassword' });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password');
    });
  });

  describe('Token Refresh', () => {
    it('rotates refresh token, returns new tokens', async () => {
      (AuthService.rotateRefreshToken as jest.Mock).mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      });
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: mockRefreshTokenValue });
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBe('new-access');
      expect(res.body.refreshToken).toBe('new-refresh');
      expect(AuthService.rotateRefreshToken).toBeCalledWith(mockRefreshTokenValue);
    });

    it('rejects invalid/expired refresh tokens', async () => {
      (AuthService.rotateRefreshToken as jest.Mock).mockRejectedValue(new Error('Refresh token invalid or expired'));
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'expired' });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Refresh token invalid or expired');
    });
  });

  describe('Protected Route Access', () => {
    beforeAll(() => {
      // Mock JWT verify
      (jwt.verify as jest.Mock).mockImplementation((token, secret, cb) => {
        if (token === 'jwt-access-token') {
          return { userId: mockUser.id, email: mockUser.email };
        }
        throw new Error('invalid token');
      });
    });

    it('allows access with valid access token', async () => {
      (jwt.verify as jest.Mock).mockImplementation(() => ({ userId: mockUser.id, email: mockUser.email }));
      const res = await request(app)
        .get('/api/user/me')
        .set('Authorization', `Bearer ${mockAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user.userId).toBe(mockUser.id);
      expect(res.body.user.email).toBe(mockUser.email);
    });

    it('rejects access with missing token', async () => {
      const res = await request(app)
        .get('/api/user/me');

      expect(res.status).toBe(401);
      expect(res.body.error || res.body.message).toBeDefined();
    });

    it('rejects access with invalid access token', async () => {
      (jwt.verify as jest.Mock).mockImplementation(() => { throw new Error('jwt malformed'); });
      const res = await request(app)
        .get('/api/user/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
      expect(res.body.error || res.body.message).toBeDefined();
    });
  });
});