import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { verifyJwt } from "../lib/jwt";
import { UserRepository } from "../repositories/user";
import type { Env } from "../types/env";
import type { PublicUser } from "../types/auth";

const me = new Hono<{ Bindings: Env }>();

me.get("/", async (c) => {
  const token = getCookie(c, "auth_token");

  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  let payload: { sub: string; email: string; iat: number; exp: number };

  try {
    payload = await verifyJwt(token, c.env.JWT_SECRET);
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const userRepo = new UserRepository(c.env.DB);

  let user: Awaited<ReturnType<typeof userRepo.findById>>;

  try {
    user = await userRepo.findById(payload.sub);
  } catch {
    return c.json({ error: "Internal server error" }, 500);
  }

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const publicUser: PublicUser = {
    id: user.id,
    email: user.email,
    created_at: user.created_at,
  };

  return c.json({ user: publicUser }, 200);
});

export { me };