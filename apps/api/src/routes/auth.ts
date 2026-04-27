import { Hono } from 'hono'
import { z } from 'zod'
import { env } from 'hono/adapter'
import type { Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { signJwt, verifyJwt } from '@pcs/auth/jwt'
import { hashPassword, verifyPassword } from '@pcs/auth/password'
import { randomUUID } from 'uncrypto'
import { db } from '../db'
import { User } from '@pcs/types'
import { sendVerificationEmail } from '../utils/email'

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['client', 'caregiver']),
  fullName: z.string().min(2),
  phone: z.string().min(10).max(20).optional(),
})

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

const authRouter = new Hono()

// ---- Register ----
authRouter.post('/register', async (c: Context) => {
  const body = await c.req.json()
  const result = RegisterSchema.safeParse(body)
  if (!result.success) {
    return c.json({ error: 'Invalid input', details: result.error.errors }, 400)
  }
  const { email, password, role, fullName, phone } = result.data

  // Check if user exists
  const exists = await db
    .prepare('SELECT id FROM users WHERE email = ?')
    .bind(email.toLowerCase())
    .first()
  if (exists) {
    return c.json({ error: 'User already exists with that email' }, 409)
  }

  const userId = randomUUID()
  const now = new Date().toISOString()
  const passwordHash = await hashPassword(password)

  await db
    .prepare(
      `INSERT INTO users (id, email, password_hash, role, full_name, phone, is_verified, avatar_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      userId,
      email.toLowerCase(),
      passwordHash,
      role,
      fullName,
      phone ?? null,
      false, // is_verified
      null, // avatar_url
      now,
      now
    )
    .run()

  // Create profile
  if (role === 'caregiver') {
    await db
      .prepare(
        `INSERT INTO caregiver_profiles (id, user_id, bio, years_experience, hourly_rate, location_city, location_state, latitude, longitude, specialties, certifications, languages, is_available, rating_avg, review_count, created_at, updated_at)
        VALUES (?, ?, '', 0, 0, '', '', null, null, '[]', '[]', '[]', 0, 0, 0, ?, ?)`
      )
      .bind(randomUUID(), userId, now, now)
      .run()
  } else if (role === 'client') {
    await db
      .prepare(
        `INSERT INTO client_profiles (id, user_id, care_recipient_name, care_recipient_age, care_needs, location_city, location_state, notes, created_at, updated_at)
        VALUES (?, ?, '', 0, '[]', '', '', null, ?, ?)`
      )
      .bind(randomUUID(), userId, now, now)
      .run()
  }

  // Optionally, send verification email (async, non-blocking)
  sendVerificationEmail(email, userId).catch(() => {})

  // JWT Issuance
  const jwtPayload = { userId, role }
  const jwt = await signJwt(jwtPayload)

  setCookie(c, 'auth_token', jwt, {
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  })

  return c.json({ success: true })
})

// ---- Login ----
authRouter.post('/login', async (c: Context) => {
  const body = await c.req.json()
  const result = LoginSchema.safeParse(body)
  if (!result.success) {
    return c.json({ error: 'Invalid input', details: result.error.errors }, 400)
  }
  const { email, password } = result.data

  const user = await db
    .prepare('SELECT id, email, password_hash, role, is_verified FROM users WHERE email = ?')
    .bind(email.toLowerCase())
    .first<User>()

  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  const valid = await verifyPassword(password, user.password_hash)
  if (!valid) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  // Optionally, check is_verified (you might want to allow login but limit access; for now, proceed)
  const jwtPayload = { userId: user.id, role: user.role }
  const jwt = await signJwt(jwtPayload)

  setCookie(c, 'auth_token', jwt, {
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  })

  return c.json({ success: true, role: user.role })
})

// ---- Logout ----
authRouter.post('/logout', async (c: Context) => {
  deleteCookie(c, 'auth_token', { path: '/' })
  return c.json({ success: true })
})

// ---- Me: get current user profile from JWT ----
authRouter.get('/me', async (c: Context) => {
  const jwt = getCookie(c, 'auth_token')
  if (!jwt) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const payload = await verifyJwt(jwt)
  if (!payload) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const user = await db
    .prepare(
      `SELECT id, email, role, full_name, phone, avatar_url, is_verified, created_at, updated_at FROM users WHERE id = ?`
    )
    .bind(payload.userId)
    .first<User>()
  if (!user) {
    return c.json({ error: 'User not found' }, 404)
  }

  return c.json({
    id: user.id,
    email: user.email,
    role: user.role,
    fullName: user.full_name,
    phone: user.phone,
    avatarUrl: user.avatar_url,
    isVerified: user.is_verified,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  })
})

// ---- JWT Refresh (if needed, optional) ----
authRouter.post('/refresh', async (c: Context) => {
  const jwt = getCookie(c, 'auth_token')
  if (!jwt) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const payload = await verifyJwt(jwt)
  if (!payload) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  // Re-issue token
  const newJwt = await signJwt({ userId: payload.userId, role: payload.role })
  setCookie(c, 'auth_token', newJwt, {
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
  return c.json({ success: true })
})

export default authRouter