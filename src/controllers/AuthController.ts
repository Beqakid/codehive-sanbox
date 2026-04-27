import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/AuthService';
import { TokenService } from '../services/TokenService';
import { ZodError } from 'zod';

export class AuthController {
  private authService: AuthService;
  private tokenService: TokenService;

  constructor(authService: AuthService, tokenService: TokenService) {
    this.authService = authService;
    this.tokenService = tokenService;
  }

  // POST /api/auth/register
  register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;
      const user = await this.authService.register(email, password);
      return res.status(201).json({ user: { id: user.id, email: user.email, createdAt: user.createdAt } });
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ message: 'Validation failed', errors: err.errors });
      }
      if ((err as any).code === 'USER_EXISTS') {
        return res.status(409).json({ message: 'User already exists' });
      }
      next(err);
    }
  };

  // POST /api/auth/login
  login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;
      const loginResult = await this.authService.login(email, password);
      const { accessToken, refreshToken, user } = loginResult;

      return res.status(200).json({
        accessToken,
        refreshToken,
        user: { id: user.id, email: user.email, createdAt: user.createdAt },
      });
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ message: 'Validation failed', errors: err.errors });
      }
      if ((err as any).code === 'INVALID_CREDENTIALS') {
        return res.status(401).json({ message: 'Invalid email or password' });
      }
      next(err);
    }
  };

  // POST /api/auth/refresh
  refresh = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = req.body;
      const result = await this.tokenService.rotateRefreshToken(refreshToken);

      return res.status(200).json({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
    } catch (err) {
      if ((err as any).code === 'TOKEN_EXPIRED' || (err as any).code === 'TOKEN_INVALID' || (err as any).code === 'TOKEN_REUSED') {
        return res.status(401).json({ message: (err as any).message || 'Invalid refresh token' });
      }
      next(err);
    }
  };

  // POST /api/auth/logout
  logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = req.body;
      await this.tokenService.revokeRefreshToken(refreshToken);
      return res.status(204).send();
    } catch (err) {
      if ((err as any).code === 'TOKEN_INVALID' || (err as any).code === 'TOKEN_EXPIRED') {
        return res.status(400).json({ message: 'Invalid refresh token' });
      }
      next(err);
    }
  };
}