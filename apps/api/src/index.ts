import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { jwt } from 'hono/jwt'
import { prettyJSON } from 'hono/pretty-json'

import { z } from 'zod'

import { nanoid } from 'nanoid'

import { usersRouter } from './routes/users'
import { caregiversRouter } from './routes/caregivers'
import { clientsRouter } from './routes/clients'
import { bookingsRouter } from './routes/bookings'
import { authRouter } from './routes/auth'
import { publicRouter } from './routes/public'

export type Env = {
  Bindings: {
    D1: D1Database
    R2_BUCKET: R2Bucket
    JWT_SECRET: string
    SESSION_KV: KVNamespace
  }
}

const app = new Hono<Env>()

// Global middlewares
app.use('*', cors({
  origin: [
    'https://pcs.app',
    'https://www.pcs.app',
    'https://client.pcs.app',
    'https://caregiver.pcs.app',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173'
  ],
  credentials: true,
  allowHeaders: ['Authorization', 'Content-Type'],
  exposeHeaders: ['Set-Cookie']
}))
app.use('*', secureHeaders())
app.use('*', prettyJSON())
app.use('*', logger())

// Health check
app.get('/health', (c) => c.json({ ok: true, uptime: process.uptime() }))

// Public (landing/info) endpoints
app.route('/public', publicRouter)

// Auth endpoints (login/register/refresh)
app.route('/auth', authRouter)

// JWT Auth middleware (for protected APIs)
// Expects HTTP-only cookie: "pcs_token={JWT}"
const withAuth = jwt({
  cookie: 'pcs_token',
  secret: (c) => c.env.JWT_SECRET,
  alg: 'HS256',
  payloadRequired: true
})

// User account/profiles API (protected)
app.route('/users', withAuth, usersRouter)

// Caregiver-side API (protected)
app.route('/caregivers', withAuth, caregiversRouter)

// Client-side API (protected)
app.route('/clients', withAuth, clientsRouter)

// Booking workflow API (protected)
app.route('/bookings', withAuth, bookingsRouter)

// 404 handler
app.notFound((c) =>
  c.json(
    { error: 'Not Found' },
    404
  )
)

// Error handler
app.onError((err, c) => {
  console.error('API Error:', err)
  return c.json({ error: err instanceof Error ? err.message : 'Internal Server Error' }, 500)
})

export default app