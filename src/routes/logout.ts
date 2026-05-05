import { NextRequest, NextResponse } from "next/server";
import { verifyJwt } from "@/lib/jwt-utils";

const COOKIE_NAME = "auth_token";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  const jwtSecret = (request as unknown as { env?: { JWT_SECRET?: string } })
    .env?.JWT_SECRET;

  if (!jwtSecret) {
    console.error("[logout] JWT_SECRET is not configured");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  try {
    await verifyJwt(token, jwtSecret);
  } catch {
    // Token is invalid or expired — still clear the cookie
    const expiredResponse = NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
    expiredResponse.cookies.set(COOKIE_NAME, "", {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });
    return expiredResponse;
  }

  const response = NextResponse.json(
    { message: "Logged out" },
    { status: 200 }
  );

  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });

  return response;
}