import { SignJWT, jwtVerify, JWTPayload, KeyLike, importJWK, JWTVerifyGetKey } from 'jose';

export interface AuthTokenPayload {
  sub: string; // user id
  email: string;
  role: 'client' | 'caregiver';
  is_verified: boolean;
  iat?: number;
  exp?: number;
}

/**
 * Parse JWK secret from env/config
 */
export async function parseJwkSecret(jwk: JsonWebKey): Promise<KeyLike> {
  // We assume symmetric key for signing JWTs (i.e., HS256)
  // "alg":"HS256", "kty":"oct", "k":"base64url_secret"
  return await importJWK(jwk, 'HS256');
}

/**
 * Sign and return a JWT token string for authentication
 */
export async function createAuthToken(
  payload: Omit<AuthTokenPayload, 'iat' | 'exp'>,
  secretKey: KeyLike,
  options?: {
    expiresIn?: number; // seconds (default: 1 day)
  }
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (options?.expiresIn ?? 86400);

  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setSubject(payload.sub)
    .sign(secretKey);
}

/**
 * Decode & verify auth token, returning the decoded AuthTokenPayload
 */
export async function verifyAuthToken(
  token: string,
  secretKey: KeyLike | JWTVerifyGetKey
): Promise<AuthTokenPayload> {
  try {
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ['HS256'],
    });

    // Sanitize payload shape
    return {
      sub: payload.sub as string,
      email: payload.email as string,
      role: payload.role as 'client' | 'caregiver',
      is_verified: Boolean(payload.is_verified),
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch (err) {
    throw new Error('Invalid or expired token');
  }
}

/**
 * Lightweight opaque token verification (like for password resets)
 */
export interface OpaqueTokenPayload {
  sub: string;
  kind: 'password_reset' | 'email_verification';
  iat?: number;
  exp?: number;
}

export async function createOpaqueToken(
  payload: Omit<OpaqueTokenPayload, 'iat' | 'exp'>,
  secretKey: KeyLike,
  options?: {
    expiresIn?: number; // seconds (default: 15m)
  }
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (options?.expiresIn ?? 900);

  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setSubject(payload.sub)
    .sign(secretKey);
}

export async function verifyOpaqueToken(
  token: string,
  secretKey: KeyLike | JWTVerifyGetKey
): Promise<OpaqueTokenPayload> {
  try {
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ['HS256'],
    });

    return {
      sub: payload.sub as string,
      kind: payload.kind as 'password_reset' | 'email_verification',
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch (err) {
    throw new Error('Invalid or expired token');
  }
}