import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { UserRepository } from "../repositories/userRepository";
import { signJwt } from "../utils/jwt";
import { verifyPassword } from "../utils/password";
import type { Env } from "../types/env";
import type { AuthTokenResponse } from "../types/auth";

const loginSchema = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .email("Must be a valid email address")
    .toLowerCase()
    .trim(),
  password: z
    .string({ required_error: "Password is required" })
    .min(1, "Password is required"),
});

const JWT_COOKIE_NAME = "auth_token";
const JWT_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

const loginRoute = new Hono<{ Bindings: Env }>();

loginRoute.post("/", async (c) => {
  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        error: "Validation failed",
        details: ["Request body must be valid JSON"],
      },
      400
    );
  }

  const parseResult = loginSchema.safeParse(body);

  if (!parseResult.success) {
    const details = parseResult.error.errors.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }));

    return c.json(
      {
        error: "Validation failed",
        details,
      },
      400
    );
  }

  const { email, password } = parseResult.data;

  const userRepo = new UserRepository(c.env.DB);

  let user: Awaited<ReturnType<typeof userRepo.findByEmail>>;

  try {
    user = await userRepo.findByEmail(email);
  } catch (err) {
    console.error("[login] Database error during user lookup:", err);
    return c.json({ error: "Internal server error" }, 500);
  }

  if (!user) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  let passwordValid: boolean;

  try {
    passwordValid = await verifyPassword(password, user.password);
  } catch (err) {
    console.error("[login] Password verification error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }

  if (!passwordValid) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const jwtSecret = c.env.JWT_SECRET;

  if (!jwtSecret) {
    console.error("[login] JWT_SECRET is not configured");
    return c.json({ error: "Internal server error" }, 500);
  }

  const expiresInSeconds = JWT_MAX_AGE_SECONDS;

  let token: string;

  try {
    token = await signJwt(
      {
        sub: user.id,
        email: user.email,
      },
      jwtSecret,
      expiresInSeconds
    );
  } catch (err) {
    console.error("[login] JWT signing error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }

  const isProduction = c.env.NODE_ENV === "production" || !c.env.NODE_ENV;

  setCookie(c, JWT_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "Strict",
    path: "/",
    maxAge: expiresInSeconds,
  });

  const responseBody: AuthTokenResponse = {
    user: {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
    },
    message: "Logged in",
  };

  return c.json(responseBody, 200);
});

export { loginRoute };