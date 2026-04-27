import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ISSUER = process.env.JWT_ISSUER || 'pcs-app-v2';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'pcs-app-v2-users';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';
const COOKIE_NAME = 'pcs_session';

export interface JWTPayload {
  sub: string;
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string | string[];
}

export interface SessionUser {
  userId: string;
  email: string;
}

function getSecretKey(): Uint8Array {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return new TextEncoder().encode(JWT_SECRET);
}

/**
 * Signs a new JWT token with the provided payload data.
 */
export async function signToken(payload: { userId: string; email: string }): Promise<string> {
  const secretKey = getSecretKey();

  const token = await new SignJWT({
    userId: payload.userId,
    email: payload.email,
  } as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.userId)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(secretKey);

  return token;
}

/**
 * Verifies and decodes a JWT token, returning the payload or null if invalid.
 */
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const secretKey = getSecretKey();

    const { payload } = await jwtVerify(token, secretKey, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    return payload as unknown as JWTPayload;
  } catch (error) {
    console.error('[auth] Token verification failed:', error);
    return null;
  }
}

/**
 * Sets the session cookie on a NextResponse.
 */
export function setSessionCookie(response: NextResponse, token: string): NextResponse {
  const isProduction = process.env.NODE_ENV === 'production';

  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days in seconds
  });

  return response;
}

/**
 * Clears the session cookie on a NextResponse.
 */
export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });

  return response;
}

/**
 * Retrieves the session token from cookies (server component usage).
 */
export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(COOKIE_NAME);
  return cookie?.value ?? null;
}

/**
 * Retrieves and verifies the current session user from cookies (server component usage).
 * Returns null if no valid session exists.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = await getSessionToken();

  if (!token) {
    return null;
  }

  const payload = await verifyToken(token);

  if (!payload) {
    return null;
  }

  return {
    userId: payload.userId,
    email: payload.email,
  };
}

/**
 * Retrieves and verifies the session user from a NextRequest object (middleware / API route usage).
 * Returns null if no valid session exists.
 */
export async function getSessionUserFromRequest(request: NextRequest): Promise<SessionUser | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const payload = await verifyToken(token);

  if (!payload) {
    return null;
  }

  return {
    userId: payload.userId,
    email: payload.email,
  };
}

/**
 * Creates an unauthorized JSON response.
 */
export function unauthorizedResponse(message = 'Unauthorized'): NextResponse {
  return NextResponse.json(
    { error: message },
    { status: 401 }
  );
}

/**
 * Higher-order utility that extracts and validates auth from a request,
 * returning the session user or an unauthorized response.
 */
export async function requireAuth(
  request: NextRequest
): Promise<{ user: SessionUser } | { response: NextResponse }> {
  const user = await getSessionUserFromRequest(request);

  if (!user) {
    return { response: unauthorizedResponse() };
  }

  return { user };
}

/**
 * Type guard to check if the result from requireAuth contains a user.
 */
export function isAuthError(
  result: { user: SessionUser } | { response: NextResponse }
): result is { response: NextResponse } {
  return 'response' in result;
}