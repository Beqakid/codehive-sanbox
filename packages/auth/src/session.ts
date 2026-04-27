import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

const SESSION_COOKIE_NAME = 'pcs_session'
const SESSION_EXP_DAYS = 7 // Session cookie TTL

export type SessionPayload = {
  sub: string // User ID
  role: 'client' | 'caregiver'
  email: string
}

export type SessionOptions = {
  cookieName?: string
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'lax' | 'strict' | 'none'
  domain?: string
  path?: string
  maxAgeDays?: number
}

function getCookieOptions(options?: SessionOptions) {
  return {
    name: options?.cookieName || SESSION_COOKIE_NAME,
    httpOnly: options?.httpOnly ?? true,
    secure: options?.secure ?? true,
    sameSite: options?.sameSite || 'lax',
    path: options?.path || '/',
    maxAge: 60 * 60 * 24 * (options?.maxAgeDays || SESSION_EXP_DAYS),
    domain: options?.domain,
  }
}

// Generate a JWT and set as an httpOnly cookie header value
export async function createSessionCookie(
  payload: SessionPayload,
  secret: string | Uint8Array,
  options?: SessionOptions
): Promise<{ cookie: string; jwt: string }> {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * (options?.maxAgeDays || SESSION_EXP_DAYS)
  const jwt = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setExpirationTime(exp)
    .setIssuedAt()
    .sign(typeof secret === 'string' ? new TextEncoder().encode(secret) : secret)

  const cookieOpt = getCookieOptions(options)
  let cookie = `${encodeURIComponent(cookieOpt.name)}=${encodeURIComponent(jwt)}`
  cookie += `; Path=${cookieOpt.path}`
  cookie += `; Max-Age=${cookieOpt.maxAge}`
  if (cookieOpt.httpOnly) cookie += '; HttpOnly'
  if (cookieOpt.secure) cookie += '; Secure'
  if (cookieOpt.sameSite) cookie += `; SameSite=${cookieOpt.sameSite.charAt(0).toUpperCase()}${cookieOpt.sameSite.slice(1)}`
  if (cookieOpt.domain) cookie += `; Domain=${cookieOpt.domain}`

  return { cookie, jwt }
}

// Parse the session cookie from the request headers
export function parseSessionCookie(
  cookies: string,
  options?: SessionOptions
): string | null {
  const cookieName = options?.cookieName || SESSION_COOKIE_NAME
  if (!cookies) return null
  const cookiesArr = cookies.split(';')
  for (const c of cookiesArr) {
    const [key, ...vals] = c.trim().split('=')
    if (key === cookieName) {
      return decodeURIComponent(vals.join('='))
    }
  }
  return null
}

// Verify a session JWT from cookie. Throws on failure.
export async function verifySessionJWT(
  token: string,
  secret: string | Uint8Array
): Promise<SessionPayload & JWTPayload> {
  const { payload } = await jwtVerify(
    token,
    typeof secret === 'string' ? new TextEncoder().encode(secret) : secret,
    {
      algorithms: ['HS256'],
    }
  )
  if (
    typeof payload.sub !== 'string' ||
    (payload.role !== 'client' && payload.role !== 'caregiver') ||
    typeof payload.email !== 'string'
  ) {
    throw new Error('Invalid session payload')
  }
  return payload as SessionPayload & JWTPayload
}

// Clear the session cookie (set to empty + expired)
export function clearSessionCookie(options?: SessionOptions): string {
  const cookieOpt = getCookieOptions(options)
  let cookie = `${encodeURIComponent(cookieOpt.name)}=`
  cookie += `; Path=${cookieOpt.path}`
  cookie += '; Max-Age=0'
  cookie += '; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  if (cookieOpt.httpOnly) cookie += '; HttpOnly'
  if (cookieOpt.secure) cookie += '; Secure'
  if (cookieOpt.sameSite) cookie += `; SameSite=${cookieOpt.sameSite.charAt(0).toUpperCase()}${cookieOpt.sameSite.slice(1)}`
  if (cookieOpt.domain) cookie += `; Domain=${cookieOpt.domain}`
  return cookie
}

// Utility: get session payload if present/valid, null otherwise
export async function getSessionFromRequest(
  cookiesHeader: string | undefined,
  secret: string | Uint8Array,
  options?: SessionOptions
): Promise<SessionPayload & JWTPayload | null> {
  if (!cookiesHeader) return null
  const token = parseSessionCookie(cookiesHeader, options)
  if (!token) return null
  try {
    return await verifySessionJWT(token, secret)
  } catch (_) {
    return null
  }
}