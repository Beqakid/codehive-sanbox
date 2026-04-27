import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { TokenService } from './TokenService';
import { UserRepository } from '../repositories/UserRepository';
import { TokenRepository } from '../repositories/TokenRepository';
import { AuthError } from '../utils/errors';

const prisma = new PrismaClient();

export interface RegisterData {
  email: string;
  password: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: {
    id: string;
    email: string;
    createdAt: Date;
    updatedAt: Date;
  };
  tokens: AuthTokens;
}

export class AuthService {
  private userRepo: UserRepository;
  private tokenRepo: TokenRepository;
  private tokenService: TokenService;

  constructor() {
    this.userRepo = new UserRepository();
    this.tokenRepo = new TokenRepository();
    this.tokenService = new TokenService();
  }

  async register(data: RegisterData): Promise<{
    user: { id: string; email: string; createdAt: Date; updatedAt: Date };
  }> {
    const email = data.email.toLowerCase().trim();
    const existing = await this.userRepo.findByEmail(email);
    if (existing) {
      throw AuthError.emailInUse();
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await this.userRepo.create({
      email,
      passwordHash,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    };
  }

  async login(data: LoginData): Promise<AuthResult> {
    const user = await this.userRepo.findByEmail(data.email.toLowerCase().trim());
    if (!user) {
      throw AuthError.invalidCredentials();
    }
    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) {
      throw AuthError.invalidCredentials();
    }
    // On login: new refresh token family
    const family = uuidv4();
    const refreshTokenRaw = this.tokenService.generateRefreshToken();
    const refreshTokenHash = this.tokenService.hashRefreshToken(refreshTokenRaw);
    const expiresAt = this.tokenService.getRefreshTokenExpiry();

    await this.tokenRepo.create({
      token: refreshTokenHash,
      userId: user.id,
      family,
      expiresAt,
    });

    const accessToken = this.tokenService.generateAccessToken(user);
    return {
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      tokens: {
        accessToken,
        refreshToken: refreshTokenRaw,
      },
    };
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    const hashed = this.tokenService.hashRefreshToken(refreshToken);
    const dbToken = await this.tokenRepo.findByToken(hashed);

    if (!dbToken) {
      throw AuthError.invalidRefreshToken();
    }

    if (dbToken.isRevoked) {
      // REUSE ATTACK: Revoke all tokens in family
      await this.tokenRepo.revokeFamily(dbToken.family);
      throw AuthError.refreshTokenReuseDetected();
    }

    if (dbToken.expiresAt.getTime() < Date.now()) {
      await this.tokenRepo.revokeToken(dbToken.id);
      throw AuthError.refreshTokenExpired();
    }

    // Rotation: revoke current, issue new token (same family)
    await this.tokenRepo.revokeToken(dbToken.id);

    const user = await this.userRepo.findById(dbToken.userId);
    if (!user) {
      throw AuthError.userNotFound();
    }
    const newTokenRaw = this.tokenService.generateRefreshToken();
    const newTokenHash = this.tokenService.hashRefreshToken(newTokenRaw);

    const newExpiresAt = this.tokenService.getRefreshTokenExpiry();

    await this.tokenRepo.create({
      token: newTokenHash,
      userId: user.id,
      family: dbToken.family,
      expiresAt: newExpiresAt,
    });

    const accessToken = this.tokenService.generateAccessToken(user);

    return {
      accessToken,
      refreshToken: newTokenRaw,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const hashed = this.tokenService.hashRefreshToken(refreshToken);
    const dbToken = await this.tokenRepo.findByToken(hashed);
    if (dbToken) {
      await this.tokenRepo.revokeToken(dbToken.id);
    }
    // No error: idempotent logout
  }

  async getUserById(id: string) {
    const user = await this.userRepo.findById(id);
    if (!user) throw AuthError.userNotFound();
    return {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}