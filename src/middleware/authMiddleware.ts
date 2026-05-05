import { NextRequest, NextResponse } from 'next/server';
import { verifyJwt } from '@/lib/jwtUtils';

const PROTECTED_ROUTES = [
  '/api/bookmarks',
  '/api/auth/me',
  '/api/auth/logout',
];

const PUBLIC_ROUTES = [
  '/api/auth/register',
  '/api/auth/login',
];

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
}

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
}

export async function authMiddleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  if (!isProtectedRoute(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const jwtSecret = (request as NextRequest & { env?: { JWT_SECRET?: string } }).env?.JWT_SECRET
    ?? process.env.JWT_SECRET;

  if (!jwtSecret) {
    console.error('authMiddleware: JWT_SECRET is not configured');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }

  try {
    const payload = await verifyJwt(token, jwtSecret);

    if (!payload) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      const response = NextResponse.json(
        { error: 'Token expired' },
        { status: 401 }
      );
      response.cookies.set('auth_token', '', {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/',
        maxAge: 0,
      });
      return response;
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', payload.sub);
    requestHeaders.set('x-user-email', payload.email);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch (error) {
    console.error('authMiddleware: JWT verification failed', error);
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }
}

export const config = {
  matcher: [
    '/api/bookmarks/:path*',
    '/api/auth/me',
    '/api/auth/logout',
    '/api/auth/register',
    '/api/auth/login',
  ],
};