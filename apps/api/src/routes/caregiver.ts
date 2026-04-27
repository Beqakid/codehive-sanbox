import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db'
import { getUserFromRequest, requireAuth, requireCaregiverRole } from '../middlewares/auth'
import { CaregiverProfileSchema, AvailabilitySlotSchema } from '../../../packages/types'
import { nanoid } from 'nanoid'
import { HTTPException } from 'hono/http-exception'

// Zod schemas for input validation
const ProfileUpdateInput = CaregiverProfileSchema.pick({
  bio: true,
  years_experience: true,
  hourly_rate: true,
  location_city: true,
  location_state: true,
  latitude: true,
  longitude: true,
  specialties: true,
  certifications: true,
  languages: true,
  is_available: true,
})

const AvailabilitySlotInput = z.object({
  day_of_week: z.number().int().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  is_recurring: z.boolean(),
  specific_date: z.string().nullable().optional(),
})
const AvailabilitySlotBulkInput = z.array(AvailabilitySlotInput)

const caregiver = new Hono()

// Middleware: Require authentication and role
caregiver.use('*', requireAuth, requireCaregiverRole)

// Get caregiver profile (GET /caregiver/profile)
caregiver.get('/profile', async (c) => {
  const user = getUserFromRequest(c)
  const profile = await db
    .selectFrom('caregiver_profiles')
    .selectAll()
    .where('user_id', '=', user.id)
    .executeTakeFirst()
  if (!profile) throw new HTTPException(404, { message: 'Profile not found' })
  // Parse JSON array fields
  const result = {
    ...profile,
    specialties: JSON.parse(profile.specialties || '[]'),
    certifications: JSON.parse(profile.certifications || '[]'),
    languages: JSON.parse(profile.languages || '[]'),
  }
  return c.json(result)
})

// Create or update caregiver profile (PUT /caregiver/profile)
caregiver.put('/profile', async (c) => {
  const user = getUserFromRequest(c)
  const input = await c.req.json().then(ProfileUpdateInput.parse)
  const now = new Date().toISOString()
  // Normalize JSON fields
  const specialties = JSON.stringify(input.specialties ?? [])
  const certifications = JSON.stringify(input.certifications ?? [])
  const languages = JSON.stringify(input.languages ?? [])

  const existing = await db
    .selectFrom('caregiver_profiles')
    .select('id')
    .where('user_id', '=', user.id)
    .executeTakeFirst()

  if (existing) {
    // Update
    await db
      .updateTable('caregiver_profiles')
      .set({
        ...input,
        specialties,
        certifications,
        languages,
        updated_at: now,
      })
      .where('user_id', '=', user.id)
      .execute()
    const updated = await db
      .selectFrom('caregiver_profiles')
      .selectAll()
      .where('user_id', '=', user.id)
      .executeTakeFirst()
    const result = {
      ...updated,
      specialties: JSON.parse(updated!.specialties || '[]'),
      certifications: JSON.parse(updated!.certifications || '[]'),
      languages: JSON.parse(updated!.languages || '[]'),
    }
    return c.json(result)
  } else {
    // Insert new
    const id = nanoid()
    await db
      .insertInto('caregiver_profiles')
      .values({
        id,
        user_id: user.id,
        ...input,
        specialties,
        certifications,
        languages,
        rating_avg: 0,
        review_count: 0,
        created_at: now,
        updated_at: now,
      })
      .execute()
    const created = await db
      .selectFrom('caregiver_profiles')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()
    const result = {
      ...created,
      specialties: JSON.parse(created!.specialties || '[]'),
      certifications: JSON.parse(created!.certifications || '[]'),
      languages: JSON.parse(created!.languages || '[]'),
    }
    return c.json(result, 201)
  }
})

// GET /caregiver/availability — list all availability slots
caregiver.get('/availability', async (c) => {
  const user = getUserFromRequest(c)
  const profile = await db
    .selectFrom('caregiver_profiles')
    .select('id')
    .where('user_id', '=', user.id)
    .executeTakeFirst()
  if (!profile) throw new HTTPException(404, { message: 'Profile not found' })

  const slots = await db
    .selectFrom('availability_slots')
    .selectAll()
    .where('caregiver_id', '=', profile.id)
    .execute()
  return c.json(slots)
})

// POST /caregiver/availability — add one or more new availability slots (bulk)
caregiver.post('/availability', async (c) => {
  const user = getUserFromRequest(c)
  const inputArr = await c.req.json().then(AvailabilitySlotBulkInput.parse)
  const profile = await db
    .selectFrom('caregiver_profiles')
    .select('id')
    .where('user_id', '=', user.id)
    .executeTakeFirst()
  if (!profile) throw new HTTPException(404, { message: 'Profile not found' })

  const now = new Date().toISOString()
  // Remove duplicate time slots (normalize on same day+start+end+date)
  const uniqSig = new Set<string>()
  const slots = inputArr
    .filter((s) => {
      const sig =
        s.day_of_week +
        '::' +
        s.start_time +
        '::' +
        s.end_time +
        '::' +
        (s.specific_date ?? 'recurring')
      if (uniqSig.has(sig)) return false
      uniqSig.add(sig)
      return true
    })
    .map((slot) => ({
      id: nanoid(),
      caregiver_id: profile.id,
      day_of_week: slot.day_of_week,
      start_time: slot.start_time,
      end_time: slot.end_time,
      is_recurring: slot.is_recurring,
      specific_date: slot.specific_date ?? null,
      created_at: now,
      updated_at: now,
    }))
  if (slots.length === 0) {
    throw new HTTPException(400, { message: 'No unique slots to insert' })
  }
  await db.insertInto('availability_slots').values(slots).execute()
  // Return the updated list
  const updated = await db
    .selectFrom('availability_slots')
    .selectAll()
    .where('caregiver_id', '=', profile.id)
    .execute()
  return c.json(updated, 201)
})

// PUT /caregiver/availability/:slotId — update a slot
caregiver.put('/availability/:slotId', async (c) => {
  const user = getUserFromRequest(c)
  const { slotId } = c.req.param()
  const input = await c.req.json().then(AvailabilitySlotInput.parse)
  const profile = await db
    .selectFrom('caregiver_profiles')
    .select('id')
    .where('user_id', '=', user.id)
    .executeTakeFirst()
  if (!profile) throw new HTTPException(404, { message: 'Profile not found' })

  // Must own the slot
  const slot = await db
    .selectFrom('availability_slots')
    .selectAll()
    .where('id', '=', slotId)
    .where('caregiver_id', '=', profile.id)
    .executeTakeFirst()
  if (!slot) throw new HTTPException(404, { message: 'Slot not found' })

  await db
    .updateTable('availability_slots')
    .set({
      ...input,
      specific_date: input.specific_date ?? null,
      updated_at: new Date().toISOString(),
    })
    .where('id', '=', slotId)
    .execute()
  const updated = await db
    .selectFrom('availability_slots')
    .selectAll()
    .where('id', '=', slotId)
    .executeTakeFirst()
  return c.json(updated)
})

// DELETE /caregiver/availability/:slotId — remove a slot
caregiver.delete('/availability/:slotId', async (c) => {
  const user = getUserFromRequest(c)
  const { slotId } = c.req.param()
  const profile = await db
    .selectFrom('caregiver_profiles')
    .select('id')
    .where('user_id', '=', user.id)
    .executeTakeFirst()
  if (!profile) throw new HTTPException(404, { message: 'Profile not found' })

  // Must own the slot
  const deleted = await db
    .deleteFrom('availability_slots')
    .where('id', '=', slotId)
    .where('caregiver_id', '=', profile.id)
    .executeTakeFirst()
  if (!deleted) throw new HTTPException(404, { message: 'Slot not found or not owned' })

  return c.json({ success: true, slotId })
})

export default caregiver