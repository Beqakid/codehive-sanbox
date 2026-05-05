import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { signJwt } from "@/lib/jwt";
import { getUserByEmail, createUser } from "@/lib/userRepository";
import type { Env, PublicUser, AuthTokenResponse } from "@/types/auth";

const RegisterSchema = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .email("Must be a valid email address")
    .max(255, "Email must be 255 characters or fewer")
    .toLowerCase()
    .trim(),
  password: z
    .string({ required_error: "Password is required" })
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be 128 characters or fewer")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    ),
});

type RegisterInput = z.infer<typeof RegisterSchema>;

const BCRYPT_COST_FACTOR = 12;
const JWT_COOKIE_NAME = "auth_token";
const JWT_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

export async function POST(request: NextRequest): Promise<NextResponse> {
  let env: Env;

  try {
    env = (request as unknown as { env: Env }).env;

    if (!env?.DB) {
      console.error("D1 database binding is missing from environment");
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    if (!env?.JWT_SECRET) {
      console.error("JWT_SECRET is missing from environment");
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("Failed to read environment bindings:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Validation failed", details: ["Request body must be valid JSON"] },
      { status: 400 }
    );
  }

  const parseResult = RegisterSchema.safeParse(body);

  if (!parseResult.success) {
    const details = parseResult.error.errors.map(
      (issue) => `${issue.path.join(".") || "field"}: ${issue.message}`
    );

    return NextResponse.json(
      { error: "Validation failed", details },
      { status: 400 }
    );
  }

  const { email, password }: RegisterInput = parseResult.data;

  try {
    const existingUser = await getUserByEmail(env.DB, email);

    if (existingUser) {
      return NextResponse.json(
        { error: "Email already in use" },
        { status: 409 }
      );
    }
  } catch (err) {
    console.error("Database error while checking existing user:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  let hashedPassword: string;

  try {
    hashedPassword = await bcrypt.hash(password, BCRYPT_COST_FACTOR);
  } catch (err) {
    console.error("Failed to hash password:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  const now = Date.now();
  const userId = uuidv4();

  let createdUser: PublicUser;

  try {
    await createUser(env.DB, {
      id: userId,
      email,
      password: hashedPassword,
      created_at: now,
      updated_at: now,
    });

    createdUser = {
      id: userId,
      email,
      created_at: now,
    };
  } catch (err) {
    console.error("Failed to create user in database:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  let token: string;

  try {
    token = await signJwt(
      {
        sub: userId,
        email,
      },
      env.JWT_SECRET,
      env.JWT_EXPIRES_IN ?? "7d"
    );
  } catch (err) {
    console.error("Failed to sign JWT:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  const responseBody: AuthTokenResponse = {
    user: createdUser,
    message: "Account created",
  };

  const response = NextResponse.json(responseBody, { status: 201 });

  response.cookies.set(JWT_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: JWT_COOKIE_MAX_AGE,
  });

  return response;
}