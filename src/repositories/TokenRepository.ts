import { PrismaClient, RefreshToken } from '@prisma/client';

const prisma = new PrismaClient();

export interface CreateRefreshTokenParams {
  token: string; // SHA-256 hash of the issued refresh token
  userId: string;
  family: string; // rotation family UUID
  expiresAt: Date;
}

export interface UpdateRefreshTokenParams {
  isRevoked?: boolean;
  expiresAt?: Date;
}

export class TokenRepository {
  /**
   * Create a refresh token record
   */
  async createRefreshToken(params: CreateRefreshTokenParams): Promise<RefreshToken> {
    return prisma.refreshToken.create({
      data: {
        token: params.token,
        userId: params.userId,
        family: params.family,
        expiresAt: params.expiresAt,
      },
    });
  }

  /**
   * Find a refresh token by its hashed token value
   */
  async findByToken(token: string): Promise<RefreshToken | null> {
    return prisma.refreshToken.findUnique({
      where: { token },
    });
  }

  /**
   * Find a refresh token by its database primary key
   */
  async findById(id: string): Promise<RefreshToken | null> {
    return prisma.refreshToken.findUnique({
      where: { id },
    });
  }

  /**
   * Mark a refresh token as revoked
   */
  async revokeById(id: string): Promise<RefreshToken | null> {
    return prisma.refreshToken.update({
      where: { id },
      data: { isRevoked: true },
    });
  }

  /**
   * Revoke all tokens in a given rotation family.
   * Used to mitigate reuse attacks.
   */
  async revokeFamily(family: string): Promise<{ count: number }> {
    return prisma.refreshToken.updateMany({
      where: { family, isRevoked: false },
      data: { isRevoked: true },
    });
  }

  /**
   * Delete (hard-delete) a refresh token by its id.
   */
  async deleteById(id: string): Promise<void> {
    await prisma.refreshToken.delete({
      where: { id },
    });
  }

  /**
   * Update fields of a refresh token (e.g. set revoked, update expiry)
   */
  async updateById(id: string, params: UpdateRefreshTokenParams): Promise<RefreshToken> {
    return prisma.refreshToken.update({
      where: { id },
      data: params,
    });
  }

  /**
   * Get all refresh tokens for a given user
   */
  async findAllByUser(userId: string): Promise<RefreshToken[]> {
    return prisma.refreshToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Find all refresh tokens for a given rotation family
   */
  async findAllByFamily(family: string): Promise<RefreshToken[]> {
    return prisma.refreshToken.findMany({
      where: { family },
      orderBy: { createdAt: 'desc' },
    });
  }
}

const tokenRepository = new TokenRepository();
export default tokenRepository;