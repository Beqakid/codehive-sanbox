import jwt, { SignOptions, JwtPayload } from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { addMinutes, isAfter } from 'date-fns';
import { PrismaClient, RefreshToken, User } from '@prisma/client';

const prisma = new PrismaClient();

type AccessTokenPayload = {
  sub: string; // user id
  email: string;
};

const ACCESS_TOKEN_LIFETIME_MINUTES = parseInt(process.env.ACCESS_TOKEN_LIFETIME_MINUTES || '15', 10);
const REFRESH_TOKEN_LIFETIME_DAYS = parseInt(process.env.REFRESH_TOKEN_LIFETIME_DAYS || '30', 10);
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || 'default_access_secret';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'default_refresh_secret';

export class TokenService {
  /**
   * Generates a JWT access token for the given user.
   */
  static async generateAccessToken(user: User): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
    };

    const options: SignOptions = {
      expiresIn: `${ACCESS_TOKEN_LIFETIME_MINUTES}m`,
      subject: user.id,
    };

    return jwt.sign(payload, ACCESS_TOKEN_SECRET, options);
  }

  /**
   * Generates and stores a new refresh token for the user.
   * Starts a new rotation family if not provided with existing family id.
   */
  static async generateRefreshToken(user: User, existingFamilyId?: string): Promise<{ token: string; tokenRecord: RefreshToken }> {
    // The raw refresh token (to be sent to client)
    const rawToken = uuidv4() + uuidv4();

    // Only store a hashed version of the refresh token in DB
    const hashedToken = TokenService.hashToken(rawToken);

    // Either a new rotation family or reuse existing
    const family = existingFamilyId || uuidv4();

    const expiresAt = addMinutes(new Date(), REFRESH_TOKEN_LIFETIME_DAYS * 24 * 60);

    const tokenRecord = await prisma.refreshToken.create({
      data: {
        token: hashedToken,
        userId: user.id,
        expiresAt: expiresAt,
        family: family,
        isRevoked: false,
      }
    });

    return { token: rawToken, tokenRecord };
  }

  /**
   * Verifies the JWT access token, throwing on error.
   */
  static verifyAccessToken(token: string): AccessTokenPayload {
    try {
      const payload = jwt.verify(token, ACCESS_TOKEN_SECRET) as AccessTokenPayload;
      return payload;
    } catch (err) {
      throw new Error('Invalid or expired access token');
    }
  }

  /**
   * Hash refresh token for secure database lookup.
   */
  static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Rotate a refresh token:
   * - Verifies the provided (raw) refresh token.
   * - Checks for expiration, revocation, and family integrity.
   * - Rotates the token (generates new, revokes old).
   * - In case of reuse attack, revokes all tokens in that family.
   * Returns the new tokens and user on success.
   */
  static async rotateRefreshToken(providedToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    user: User;
  }> {
    const hashedToken = TokenService.hashToken(providedToken);

    // Get the refresh token record & user
    const tokenRecord = await prisma.refreshToken.findUnique({
      where: { token: hashedToken },
      include: { user: true }
    });

    if (!tokenRecord) {
      throw new Error('Invalid refresh token');
    }

    // Check if expired
    if (isAfter(new Date(), tokenRecord.expiresAt)) {
      // Invalidate family (proactive defense for old tokens)
      await TokenService.revokeFamily(tokenRecord.family);
      throw new Error('Refresh token expired');
    }

    // Check if already revoked (could be a reuse attack)
    if (tokenRecord.isRevoked) {
      // Reuse attack detected: revoke entire family
      await TokenService.revokeFamily(tokenRecord.family);
      throw new Error('Refresh token reuse detected. All sessions for this family have been revoked.');
    }

    // At this point: token is valid and not reused/revoked
    // Revoke the current token
    await prisma.refreshToken.update({
      where: { token: hashedToken },
      data: { isRevoked: true }
    });

    // Generate a new refresh token in the same family
    const { token: newRawRefreshToken, tokenRecord: newTokenRecord } = await TokenService.generateRefreshToken(tokenRecord.user, tokenRecord.family);

    // New access token
    const newAccessToken = await TokenService.generateAccessToken(tokenRecord.user);

    return {
      accessToken: newAccessToken,
      refreshToken: newRawRefreshToken,
      user: tokenRecord.user
    };
  }

  /**
   * Revokes an individual refresh token (for logout).
   */
  static async revokeRefreshToken(providedToken: string): Promise<void> {
    const hashedToken = TokenService.hashToken(providedToken);
    const tokenRecord = await prisma.refreshToken.findUnique({
      where: { token: hashedToken }
    });

    if (!tokenRecord) return; // No-op

    await prisma.refreshToken.update({
      where: { token: hashedToken },
      data: { isRevoked: true }
    });
  }

  /**
   * Revokes all refresh tokens in the given rotation family.
   * Used to mitigate reuse/replay attacks.
   */
  static async revokeFamily(familyId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { family: familyId, isRevoked: false },
      data: { isRevoked: true },
    });
  }

  /**
   * Helper: For login, creates BOTH access/refresh tokens and stores refresh record.
   */
  static async issueTokens(user: User): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const accessToken = await TokenService.generateAccessToken(user);
    const { token: refreshToken } = await TokenService.generateRefreshToken(user);
    return { accessToken, refreshToken };
  }
}

export default TokenService;