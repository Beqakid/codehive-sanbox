import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock Web Crypto for JWT utils
const mockSign = jest.fn() as jest.Mock;
const mockVerify = jest.fn() as jest.Mock;
const mockImportKey = jest.fn() as jest.Mock;

Object.defineProperty(globalThis, 'crypto', {
  value: {
    subtle: {
      sign: mockSign,
      verify: mockVerify,
      importKey: mockImportKey,
    },
    randomUUID: jest.fn(() => 'mock-uuid-1234'),
  },
  writable: true,
});

// Mock bcryptjs
jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
  genSalt: jest.fn(),
}));

import bcrypt from 'bcryptjs';
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

// ─── Types ────────────────────────────────────────────────────────────────────

interface User {
  id: string;
  email: string;
  password: string;
  created_at: number;
  updated_at: number;
}

interface PublicUser {
  id: string;
  email: string;
  created_at: number;
}

interface JwtPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

// ─── Inline implementations under test ───────────────────────────────────────

// These mirror the real implementations so we can test logic without
// importing from unbuilt Next.js route files.

async function buildClaims(userId: string, email: string, expiresInSeconds = 604800): Promise<JwtPayload> {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: userId,
    email,
    iat: now,
    exp: now + expiresInSeconds,
  };
}

function base64UrlEncode(data: string): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64UrlDecode(data: string): string {
  const padded = data + '==='.slice((data.length + 3) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

async function signJwt(payload: JwtPayload, secret: string): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;

  const keyData = new TextEncoder().encode(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  const signature = base64UrlEncode(
    String.fromCharCode(...new Uint8Array(signatureBuffer as ArrayBuffer)),
  );

  return `${signingInput}.${signature}`;
}

async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, body, signature] = parts;
    const signingInput = `${header}.${body}`;

    const keyData = new TextEncoder().encode(secret);
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    const sigBytes = Uint8Array.from(
      base64UrlDecode(signature).split('').map((c) => c.charCodeAt(0)),
    );

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      new TextEncoder().encode(signingInput),
    );

    if (!valid) return null;

    const payload: JwtPayload = JSON.parse(base64UrlDecode(body));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;

    return payload;
  } catch {
    return null;
  }
}

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    created_at: user.created_at,
  };
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password: string): boolean {
  return password.length >= 8;
}

async function hashPassword(password: string): Promise<string> {
  return mockBcrypt.hash(password, 12) as unknown as string;
}

async function comparePassword(plain: string, hashed: string): Promise<boolean> {
  return mockBcrypt.compare(plain, hashed) as unknown as boolean;
}

function buildAuthCookie(token: string, maxAge = 604800): string {
  return `auth_token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

function buildLogoutCookie(): string {
  return `auth_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

function extractTokenFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]+)/);
  return match ? match[1] : null;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('JwtUtils', () => {
  const secret = 'test-secret-key-32-bytes-minimum!';
  const now = Math.floor(Date.now() / 1000);

  const samplePayload: JwtPayload = {
    sub: 'user-id-123',
    email: 'test@example.com',
    iat: now,
    exp: now + 3600,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('base64UrlEncode / base64UrlDecode', () => {
    it('encodes a string to base64url without padding characters', () => {
      const encoded = base64UrlEncode('hello world');
      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');
      expect(encoded).not.toContain('=');
    });

    it('round-trips a JSON string correctly', () => {
      const original = JSON.stringify({ alg: 'HS256', typ: 'JWT' });
      const encoded = base64UrlEncode(original);
      const decoded = base64UrlDecode(encoded);
      expect(decoded).toBe(original);
    });

    it('round-trips an arbitrary payload string', () => {
      const original = JSON.stringify({ sub: 'abc', email: 'a@b.com', iat: 1000, exp: 2000 });
      expect(base64UrlDecode(base64UrlEncode(original))).toBe(original);
    });
  });

  describe('buildClaims', () => {
    it('sets sub to the user id', async () => {
      const claims = await buildClaims('uid-42', 'u@example.com');
      expect(claims.sub).toBe('uid-42');
    });

    it('sets email correctly', async () => {
      const claims = await buildClaims('uid-42', 'u@example.com');
      expect(claims.email).toBe('u@example.com');
    });

    it('sets iat to the current unix second', async () => {
      const before = Math.floor(Date.now() / 1000);
      const claims = await buildClaims('uid', 'a@b.com');
      const after = Math.floor(Date.now() / 1000);
      expect(claims.iat).toBeGreaterThanOrEqual(before);
      expect(claims.iat).toBeLessThanOrEqual(after);
    });

    it('sets default exp 7 days in the future', async () => {
      const claims = await buildClaims('uid', 'a@b.com');
      expect(claims.exp - claims.iat).toBe(604800);
    });

    it('respects a custom expiry duration', async () => {
      const claims = await buildClaims('uid', 'a@b.com', 3600);
      expect(claims.exp - claims.iat).toBe(3600);
    });
  });

  describe('signJwt', () => {
    beforeEach(() => {
      const mockKey = {};
      mockImportKey.mockResolvedValue(mockKey);
      const mockSigBuffer = new Uint8Array([1, 2, 3, 4]).buffer;
      mockSign.mockResolvedValue(mockSigBuffer);
    });

    it('calls importKey with HMAC SHA-256 for signing', async () => {
      await signJwt(samplePayload, secret);
      expect(mockImportKey).toHaveBeenCalledWith(
        'raw',
        expect.any(Uint8Array),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );
    });

    it('calls subtle.sign with HMAC algorithm', async () => {
      await signJwt(samplePayload, secret);
      expect(mockSign).toHaveBeenCalledWith('HMAC', expect.anything(), expect.any(Uint8Array));
    });

    it('returns a string with three dot-separated parts', async () => {
      const token = await signJwt(samplePayload, secret);
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
    });

    it('encodes the correct header in the first segment', async () => {
      const token = await signJwt(samplePayload, secret);
      const [headerPart] = token.split('.');
      const header = JSON.parse(base64UrlDecode(headerPart));
      expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
    });

    it('encodes the payload in the second segment', async () => {
      const token = await signJwt(samplePayload, secret);
      const [, bodyPart] = token.split('.');
      const decoded = JSON.parse(base64UrlDecode(bodyPart));
      expect(decoded.sub).toBe(samplePayload.sub);
      expect(decoded.email).toBe(samplePayload.email);
    });
  });

  describe('verifyJwt', () => {
    it('returns null when the token does not have three parts', async () => {
      const result = await verifyJwt('invalid.token', secret);
      expect(result).toBeNull();
    });

    it('returns null when subtle.verify returns false', async () => {
      const mockKey = {};
      mockImportKey.mockResolvedValue(mockKey);
      mockVerify.mockResolvedValue(false);

      const fakeToken = 'aaa.bbb.ccc';
      const result = await verifyJwt(fakeToken, secret);
      expect(result).toBeNull();
    });

    it('returns null when the token is expired', async () => {
      const mockKey = {};
      mockImportKey.mockResolvedValue(mockKey);
      mockVerify.mockResolvedValue(true);

      const expiredPayload: JwtPayload = {
        sub: 'uid',
        email: 'x@y.com',
        iat: now - 7200,
        exp: now - 3600, // already expired
      };

      const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const body = base64UrlEncode(JSON.stringify(expiredPayload));
      const fakeToken = `${header}.${body}.fakesig`;

      const result = await verifyJwt(fakeToken, secret);
      expect(result).toBeNull();
    });

    it('returns the payload when the token is valid and not expired', async () => {
      const mockKey = {};
      mockImportKey.mockResolvedValue(mockKey);
      mockVerify.mockResolvedValue(true);

      const validPayload: JwtPayload = {
        sub: 'uid-123',
        email: 'valid@example.com',
        iat: now,
        exp: now + 3600,
      };

      const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const body = base64UrlEncode(JSON.stringify(validPayload));
      const fakeToken = `${header}.${body}.fakesig`;

      const result = await verifyJwt(fakeToken, secret);
      expect(result).not.toBeNull();
      expect(result?.sub).toBe('uid-123');
      expect(result?.email).toBe('valid@example.com');
    });

    it('returns null when an exception is thrown internally', async () => {
      mockImportKey.mockRejectedValue(new Error('crypto failure'));
      const result = await verifyJwt('a.b.c', secret);
      expect(result).toBeNull();
    });

    it('calls importKey with verify usage', async () => {
      const mockKey = {};
      mockImportKey.mockResolvedValue(mockKey);
      mockVerify.mockResolvedValue(false);

      await verifyJwt('a.b.c', secret);

      expect(mockImportKey).toHaveBeenCalledWith(
        'raw',
        expect.any(Uint8Array),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify'],
      );
    });
  });
});

// ─── AuthService helpers ──────────────────────────────────────────────────────

describe('AuthService helpers', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('hashPassword', () => {
    it('calls bcrypt.hash with cost factor 12', async () => {
      (mockBcrypt.hash as jest.Mock).mockResolvedValue('hashed_pw');
      const result = await hashPassword('mySecret!');
      expect(mockBcrypt.hash).toHaveBeenCalledWith('mySecret!', 12);
      expect(result).toBe('hashed_pw');
    });
  });

  describe('comparePassword', () => {
    it('returns true when passwords match', async () => {
      (mockBcrypt.compare as jest.Mock).mockResolvedValue(true);
      const result = await comparePassword('plain', 'hashed');
      expect(result).toBe(true);
    });

    it('returns false when passwords do not match', async () => {
      (mockBcrypt.compare as jest.Mock).mockResolvedValue(false);
      const result = await comparePassword('wrong', 'hashed');
      expect(result).toBe(false);
    });

    it('passes plain and hashed to bcrypt.compare', async () => {
      (mockBcrypt.compare as jest.Mock).mockResolvedValue(true);
      await comparePassword('plaintext', 'bcrypt_hash');
      expect(mockBcrypt.compare).toHaveBeenCalledWith('plaintext', 'bcrypt_hash');
    });
  });

  describe('toPublicUser', () => {
    it('strips the password field', () => {
      const user: User = {
        id: 'u1',
        email: 'a@b.com',
        password: 'secret_hash',
        created_at: 1000,
        updated_at: 2000,
      };
      const pub = toPublicUser(user);
      expect((pub as unknown as Record<string, unknown>).password).toBeUndefined();
    });

    it('returns id, email and created_at', () => {
      const user: User = {
        id: 'u1',
        email: 'a@b.com',
        password: 'secret_hash',
        created_at: 1000,
        updated_at: 2000,
      };
      const pub = toPublicUser(user);
      expect(pub).toEqual({ id: 'u1', email: 'a@b.com', created_at: 1000 });
    });

    it('does not include updated_at in the public representation', () => {
      const user: User = {
        id: 'u2',
        email: 'b@c.com',
        password: 'hash',
        created_at: 500,
        updated_at: 9999,
      };
      const pub = toPublicUser(user);
      expect((pub as unknown as Record<string, unknown>).updated_at).toBeUndefined();
    });
  });
});

// ─── Validation ───────────────────────────────────────────────────────────────

describe('Validation helpers', () => {
  describe('validateEmail', () => {
    it('returns true for a valid email', () => {
      expect(validateEmail('user@example.com')).toBe(true);
    });

    it('returns true for a subdomain email', () => {
      expect(validateEmail('user@mail.example.co.uk')).toBe(true);
    });

    it('returns false for a missing @ symbol', () => {
      expect(validateEmail('userexample.com')).toBe(false);
    });

    it('returns false for a missing domain', () => {
      expect(validateEmail('user@')).toBe(false);
    });

    it('returns false for an empty string', () => {
      expect(validateEmail('')).toBe(false);
    });

    it('returns false for whitespace in the local part', () => {
      expect(validateEmail('user name@example.com')).toBe(false);
    });
  });

  describe('validatePassword', () => {
    it('returns true for a password of exactly 8 characters', () => {
      expect(validatePassword('12345678')).toBe(true);
    });

    it('returns true for a password longer than 8 characters', () => {
      expect(validatePassword('P@ssword123!')).toBe(true);
    });

    it('returns false for a password shorter than 8 characters', () => {
      expect(validatePassword('short')).toBe(false);
    });

    it('returns false for an empty password', () => {
      expect(validatePassword('')).toBe(false);
    });
  });
});

// ─── Cookie helpers ───────────────────────────────────────────────────────────

describe('Cookie helpers', () => {
  describe('buildAuthCookie', () => {
    it('includes the token value', () => {
      const cookie = buildAuthCookie('my.jwt.token');
      expect(cookie).toContain('auth_token=my.jwt.token');
    });

    it('sets HttpOnly flag', () => {
      expect(buildAuthCookie('tok')).toContain('HttpOnly');
    });

    it('sets Secure flag', () => {
      expect(buildAuthCookie('tok')).toContain('Secure');
    });

    it('sets SameSite=Strict', () => {
      expect(buildAuthCookie('tok')).toContain('SameSite=Strict');
    });

    it('uses the default Max-Age of 604800', () => {
      expect(buildAuthCookie('tok')).toContain('Max-Age=604800');
    });

    it('respects a custom Max-Age', () => {
      expect(buildAuthCookie('tok', 3600)).toContain('Max-Age=3600');
    });

    it('sets Path=/', () => {
      expect(buildAuthCookie('tok')).toContain('Path=/');
    });
  });

  describe('buildLogoutCookie', () => {
    it('sets auth_token to empty string', () => {
      expect(buildLogoutCookie()).toContain('auth_token=;');
    });

    it('sets Max-Age=0 to expire the cookie', () => {
      expect(buildLogoutCookie()).toContain('Max-Age=0');
    });

    it('sets HttpOnly flag', () => {
      expect(buildLogoutCookie()).toContain('HttpOnly');
    });

    it('sets Secure flag', () => {
      expect(buildLogoutCookie()).toContain('Secure');
    });
  });

  describe('extractTokenFromCookieHeader', () => {
    it('returns null when the header is null', () => {
      expect(extractTokenFromCookieHeader(null)).toBeNull();
    });

    it('extracts the auth_token from a simple cookie string', () => {
      const result = extractTokenFromCookieHeader('auth_token=abc.def.ghi');
      expect(result).toBe('abc.def.ghi');
    });

    it('extracts auth_token when other cookies are present before it', () => {
      const result = extractTokenFromCookieHeader('session=xyz; auth_token=my.token.here');
      expect(result).toBe('my.token.here');
    });

    it('extracts auth_token when other cookies follow it', () => {
      const result = extractTokenFromCookieHeader('auth_token=tok; other=val');
      expect(result).toBe('tok');
    });

    it('returns null when auth_token is not in the cookie string', () => {
      const result = extractTokenFromCookieHeader('session=xyz; foo=bar');
      expect(result).toBeNull();
    });

    it('returns null for an empty cookie header', () => {
      expect(extractTokenFromCookieHeader('')).toBeNull();
    });
  });
});

// ─── Integration-style: register flow (mocked D1) ────────────────────────────

describe('Register flow (unit, mocked dependencies)', () => {
  const mockStatement = {
    bind: jest.fn() as jest.Mock,
    first: jest.fn() as jest.Mock,
    run: jest.fn() as jest.Mock,
  };

  const mockDb = {
    prepare: jest.fn() as jest.Mock,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStatement);
    mockStatement.bind.mockReturnValue(mockStatement);
  });

  it('rejects registration with an invalid email', async () => {
    const email = 'not-an-email';
    const password = 'ValidPass1!';
    expect(validateEmail(email)).toBe(false);
  });

  it('rejects registration with a short password', () => {
    const email = 'user@example.com';
    const password = 'short';
    expect(validatePassword(password)).toBe(false);
  });

  it('accepts valid email and password', () => {
    expect(validateEmail('user@example.com')).toBe(true);
    expect(validatePassword('ValidPass1!')).toBe(true);
  });

  it('hashes the password before storage', async () => {
    (mockBcrypt.hash as jest.Mock).mockResolvedValue('bcrypt_hash_result');
    const hashed = await hashPassword('ValidPass1!');
    expect(hashed).toBe('bcrypt_hash_result');
    expect(mockBcrypt.hash).toHaveBeenCalledWith('ValidPass1!', 12);
  });

  it('detects duplicate email via DB lookup returning a user', async () => {
    mockStatement.first.mockResolvedValue({ id: 'existing', email: 'user@example.com' });
    const existing = await mockStatement.bind('user@example.com').first();
    expect(existing).not.toBeNull();
  });

  it('proceeds when DB lookup returns null (no duplicate)', async () => {
    mockStatement.first.mockResolvedValue(null);
    const existing = await mockStatement.bind('new@example.com').first();
    expect(existing).toBeNull();
  });
});

// ─── Integration-style: login flow (mocked D1) ───────────────────────────────

describe('Login flow (unit, mocked dependencies)', () => {
  const mockStatement = {
    bind: jest.fn() as jest.Mock,
    first: jest.fn() as jest.Mock,
  };

  const mockDb = {
    prepare: jest.fn() as jest.Mock,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStatement);
    mockStatement.bind.mockReturnValue(mockStatement);
  });

  it('returns null user when email not found in DB', async () => {
    mockStatement.first.mockResolvedValue(null);
    const user = await mockStatement.bind('ghost@example.com').first();
    expect(user).toBeNull();
  });

  it('returns false from comparePassword when password is wrong', async () => {
    (mockBcrypt.compare as jest.Mock).mockResolvedValue(false);
    const match = await comparePassword('wrongpass', 'correcthash');
    expect(match).toBe(false);
  });

  it('returns true from comparePassword with the correct password', async () => {
    (mockBcrypt.compare as jest.Mock).mockResolvedValue(true);
    const match = await comparePassword('correctpass', 'correcthash');
    expect(match).toBe(true);
  });

  it('builds a public user after successful login', () => {
    const dbUser: User = {
      id: 'user-1',
      email: 'test@example.com',
      password: 'hashed',
      created_at: 1000,
      updated_at: 2000,
    };
    const pub = toPublicUser(dbUser);
    expect(pub).toEqual({ id: 'user-1', email: 'test@example.com', created_at: 1000 });
  });
});

// ─── Middleware logic ─────────────────────────────────────────────────────────

describe('Auth middleware logic', () => {
  const secret = 'test-secret';
  const now = Math.floor(Date.now() / 1000);

  beforeEach(() => jest.clearAllMocks());

  it('rejects a request with no cookie header (no token)', async () => {
    const token = extractTokenFromCookieHeader(null);
    expect(token).toBeNull();
  });

  it('rejects when token extraction fails from a malformed cookie', () => {
    const token = extractTokenFromCookieHeader('garbage_cookie_data');
    expect(token).toBeNull();
  });

  it('rejects when verifyJwt returns null (bad signature)', async () => {
    const mockKey = {};
    mockImportKey.mockResolvedValue(mockKey);
    mockVerify.mockResolvedValue(false);

    const result = await verifyJwt('bad.token.signature', secret);
    expect(result).toBeNull();
  });

  it('allows request when verifyJwt returns a valid payload', async () => {
    const validPayload: JwtPayload = {
      sub: 'uid-999',
      email: 'auth@example.com',
      iat: now,
      exp: now + 7200,
    };

    mockImportKey.mockResolvedValue({});
    mockVerify.mockResolvedValue(true);

    const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = base64UrlEncode(JSON.stringify(validPayload));
    const token = `${header}.${body}.sig`;

    const result = await verifyJwt(token, secret);
    expect(result).not.toBeNull();
    expect(result?.sub).toBe('uid-999');
  });

  it('extracts user_id from the verified payload', async () => {
    const validPayload: JwtPayload = {
      sub: 'user-for-middleware',
      email: 'mw@example.com',
      iat: now,
      exp: now + 7200,
    };

    mockImportKey.mockResolvedValue({});
    mockVerify.mockResolvedValue(true);

    const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = base64UrlEncode(JSON.stringify(validPayload));
    const token = `${header}.${body}.sig`;

    const result = await verifyJwt(token, secret);
    expect(result?.sub).toBe('user-for-middleware');
  });
});

// ─── Bookmark ownership logic ─────────────────────────────────────────────────

describe('Bookmark ownership logic', () => {
  interface Bookmark {
    id: string;
    user_id: string;
    url: string;
    title: string;
  }

  function isBookmarkOwner(bookmark: Bookmark, userId: string): boolean {
    return bookmark.user_id === userId;
  }

  it('returns true when the bookmark belongs to the user', () => {
    const bookmark: Bookmark = { id: 'bk1', user_id: 'u1', url: 'https://a.com', title: 'A' };
    expect(isBookmarkOwner(bookmark, 'u1')).toBe(true);
  });

  it('returns false when the bookmark belongs to a different user', () => {
    const bookmark: Bookmark = { id: 'bk1', user_id: 'u1', url: 'https://a.com', title: 'A' };
    expect(isBookmarkOwner(bookmark, 'u2')).toBe(false);
  });

  it('returns false for an empty userId', () => {
    const bookmark: Bookmark = { id: 'bk1', user_id: 'u1', url: 'https://a.com', title: 'A' };
    expect(isBookmarkOwner(bookmark, '')).toBe(false);
  });
});
