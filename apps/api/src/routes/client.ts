import { Hono } from 'hono'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { getUserFromRequest } from '../utils/auth'
import type { Context } from 'hono'
import type { User } from 'packages/types'
import { D1Database } from '@cloudflare/workers-types'

const app = new Hono<{ Bindings: { DB: D1Database } }>()

// Helpers
function parseJSON<T>(v: string | null): T | null {
  if (!v) return null
  try {
    return JSON.parse(v)
  } catch {
    return null
  }
}

//
// Schema
//

const searchSchema = z.object({
  q: z.string().max(128).optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  specialties: z.string().optional(), // comma separated
  min_experience: z.coerce.number().min(0).max(100).optional(),
  min_rating: z.coerce.number().min(0).max(5).optional(),
  available: z.coerce.boolean().optional()
})

const bookSchema = z.object({
  caregiver_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // ISO date
  time: z.string().regex(/^\d{2}:\d{2}$/), // HH:mm
  duration_hours: z.number().min(1).max(24)
})

//
// Middlewares
//

async function ensureClient(c: Context) {
  const user = await getUserFromRequest(c)
  if (!user || user.role !== 'client') {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  return user
}

//
// GET /client/caregivers -- search caregivers
//

app.get('/client/caregivers', async c => {
  const search = searchSchema.safeParse(c.req.query())
  if (!search.success) {
    return c.json({ error: 'Invalid query', details: search.error.flatten() }, 400)
  }
  const { q, city, state, specialties, min_experience, min_rating, available } = search.data

  let sql = `
    SELECT p.*, u.full_name, u.avatar_url
      FROM caregiver_profiles p
      JOIN users u ON p.user_id = u.id
     WHERE 1 = 1`
  const params: any[] = []

  if (q) {
    sql += ` AND (u.full_name LIKE ? OR p.bio LIKE ?)`
    params.push(`%${q}%`, `%${q}%`)
  }
  if (city) {
    sql += ` AND p.location_city = ?`
    params.push(city)
  }
  if (state) {
    sql += ` AND p.location_state = ?`
    params.push(state)
  }
  if (specialties) {
    const arr = specialties.split(',').map(s => s.trim()).filter(Boolean)
    if (arr.length) {
      sql += ' AND (' +
        arr.map(_ => `JSON_CONTAINS(p.specialties, '"${_}"')`).join(' OR ') +
        ')'
    }
  }
  if (min_experience !== undefined) {
    sql += ` AND p.years_experience >= ?`
    params.push(min_experience)
  }
  if (min_rating !== undefined) {
    sql += ` AND p.rating_avg >= ?`
    params.push(min_rating)
  }
  if (available !== undefined) {
    sql += ` AND p.is_available = ?`
    params.push(available ? 1 : 0)
  }

  sql += ' ORDER BY p.rating_avg DESC, p.review_count DESC LIMIT 30'

  try {
    const { results } = await c.env.DB.prepare(sql).bind(...params).all()
    const caregivers = (results as any[]).map(row => ({
      id: row.id,
      user_id: row.user_id,
      full_name: row.full_name,
      avatar_url: row.avatar_url,
      bio: row.bio,
      years_experience: row.years_experience,
      hourly_rate: row.hourly_rate,
      location_city: row.location_city,
      location_state: row.location_state,
      specialties: parseJSON<string[]>(row.specialties) ?? [],
      certifications: parseJSON<string[]>(row.certifications) ?? [],
      languages: parseJSON<string[]>(row.languages) ?? [],
      is_available: !!row.is_available,
      rating_avg: row.rating_avg,
      review_count: row.review_count
    }))
    return c.json({ caregivers })
  } catch (err) {
    return c.json({ error: 'Search failed', details: (err as Error).message }, 500)
  }
})

//
// POST /client/bookings -- create a new booking
//

app.post('/client/bookings', async c => {
  const user = await ensureClient(c)
  if (!user) return

  let body
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }
  const parsed = bookSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'Invalid booking data', details: parsed.error.flatten() }, 400)
  }
  const { caregiver_id, date, time, duration_hours } = parsed.data

  // Verify caregiver exists and is available
  const caregiverRow = await c.env.DB.prepare(
    `SELECT u.id, u.full_name, cp.id AS profile_id, cp.is_available
        FROM users u
        JOIN caregiver_profiles cp ON u.id = cp.user_id
       WHERE u.id = ? AND u.role = 'caregiver'`
  ).bind(caregiver_id).first()
  if (!caregiverRow) {
    return c.json({ error: 'Caregiver not found' }, 404)
  }
  if (!caregiverRow.is_available) {
    return c.json({ error: 'Caregiver is not currently available' }, 409)
  }

  // For MVP: We'll assume the slot is allowed if is_available = 1; real logic would check exact slots.

  // Create booking
  const id = uuidv4()
  const scheduled_at = `${date}T${time}:00`
  try {
    await c.env.DB.prepare(
      `INSERT INTO bookings
        (id, client_id, caregiver_id, status, scheduled_date, scheduled_time, duration_hours, created_at, updated_at)
      VALUES (?, ?, ?, 'pending', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    ).bind(
      id,
      (user as User).id,
      caregiver_id,
      date,
      time,
      duration_hours
    ).run()
    return c.json({ booking_id: id, status: 'pending' }, 201)
  } catch (err) {
    return c.json({ error: 'Booking failed', details: (err as Error).message }, 500)
  }
})

//
// GET /client/bookings -- get client's booking history
//

app.get('/client/bookings', async c => {
  const user = await ensureClient(c)
  if (!user) return

  const q =
    `SELECT b.*, cg.full_name AS caregiver_name, cg.avatar_url AS caregiver_avatar
      FROM bookings b
      JOIN users cg ON b.caregiver_id = cg.id
     WHERE b.client_id = ?
     ORDER BY b.scheduled_date DESC, b.scheduled_time DESC
     LIMIT 30`
  try {
    const { results } = await c.env.DB.prepare(q).bind((user as User).id).all()
    const bookings = (results as any[]).map(row => ({
      id: row.id,
      caregiver_id: row.caregiver_id,
      caregiver_name: row.caregiver_name,
      caregiver_avatar: row.caregiver_avatar,
      status: row.status,
      scheduled_date: row.scheduled_date,
      scheduled_time: row.scheduled_time,
      duration_hours: row.duration_hours,
      created_at: row.created_at,
      updated_at: row.updated_at
    }))
    return c.json({ bookings })
  } catch (err) {
    return c.json({ error: 'History fetch failed', details: (err as Error).message }, 500)
  }
})

export default app