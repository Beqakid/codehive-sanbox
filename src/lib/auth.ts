import type { JwtPayload } from "@/types/auth";

const ALGORITHM = "HMAC";
const HASH = "SHA-256";
const DEFAULT_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60; // 7 days

function base64UrlEncode(input: ArrayBuffer | string): string {
  let bytes: Uint8Array;
  if (typeof input === "string") {
    bytes = new TextEncoder().encode(input);
  } else {
    bytes = new Uint8Array(input);
  }

  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  const paddedString = padded + "=".repeat(padLength);
  const binary = atob(paddedString);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importKey(secret: string): Promise<CryptoKey> {
  const keyData = new TextEncoder().encode(secret);
  return crypto.subtle.importKey(
    "raw",
    keyData,
    { name: ALGORITHM, hash: HASH },
    false,
    ["sign", "verify"]
  );
}

export interface SignOptions {
  expiresInSeconds?: number;
}

export async function signJwt(
  payload: Omit<JwtPayload, "iat" | "exp">,
  secret: string,
  options: SignOptions = {}
): Promise<string> {
  const expiresInSeconds =
    options.expiresInSeconds ?? DEFAULT_EXPIRES_IN_SECONDS;

  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await importKey(secret);
  const signatureBuffer = await crypto.subtle.sign(
    ALGORITHM,
    key,
    new TextEncoder().encode(signingInput)
  );

  const encodedSignature = base64UrlEncode(signatureBuffer);

  return `${signingInput}.${encodedSignature}`;
}

export interface VerifyResult {
  valid: boolean;
  payload: JwtPayload | null;
  error?: string;
}

export async function verifyJwt(
  token: string,
  secret: string
): Promise<VerifyResult> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { valid: false, payload: null, error: "Malformed token" };
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;

    const headerBytes = base64UrlDecode(encodedHeader);
    const headerJson = new TextDecoder().decode(headerBytes);
    const header = JSON.parse(headerJson);

    if (header.alg !== "HS256" || header.typ !== "JWT") {
      return {
        valid: false,
        payload: null,
        error: "Unsupported algorithm or token type",
      };
    }

    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signatureBytes = base64UrlDecode(encodedSignature);

    const key = await importKey(secret);
    const isValid = await crypto.subtle.verify(
      ALGORITHM,
      key,
      signatureBytes,
      new TextEncoder().encode(signingInput)
    );

    if (!isValid) {
      return { valid: false, payload: null, error: "Invalid signature" };
    }

    const payloadBytes = base64UrlDecode(encodedPayload);
    const payloadJson = new TextDecoder().decode(payloadBytes);
    const payload: JwtPayload = JSON.parse(payloadJson);

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return { valid: false, payload: null, error: "Token expired" };
    }

    if (payload.iat > now + 60) {
      return {
        valid: false,
        payload: null,
        error: "Token issued in the future",
      };
    }

    if (!payload.sub || !payload.email) {
      return {
        valid: false,
        payload: null,
        error: "Missing required claims",
      };
    }

    return { valid: true, payload };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { valid: false, payload: null, error: `Token parsing failed: ${message}` };
  }
}

export function buildClaims(
  userId: string,
  email: string
): Omit<JwtPayload, "iat" | "exp"> {
  return {
    sub: userId,
    email,
  };
}

export function parseExpiresIn(expiresIn: string): number {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) {
    return DEFAULT_EXPIRES_IN_SECONDS;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "s":
      return value;
    case "m":
      return value * 60;
    case "h":
      return value * 60 * 60;
    case "d":
      return value * 24 * 60 * 60;
    default:
      return DEFAULT_EXPIRES_IN_SECONDS;
  }
}

export const AUTH_COOKIE_NAME = "auth_token";
export const AUTH_COOKIE_MAX_AGE = DEFAULT_EXPIRES_IN_SECONDS;

export function buildAuthCookieHeader(token: string, maxAge: number): string {
  return `${AUTH_COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

export function buildClearCookieHeader(): string {
  return `${AUTH_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}