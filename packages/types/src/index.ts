import { z } from "zod";

// User definitions

export type UserRole = "client" | "caregiver";

export interface User {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export const userRoleEnum = z.enum(["client", "caregiver"]);
export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  password_hash: z.string(),
  role: userRoleEnum,
  full_name: z.string(),
  phone: z.string().nullable(),
  avatar_url: z.string().url().nullable(),
  is_verified: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

// Caregiver Profile

export interface CaregiverProfile {
  id: string;
  user_id: string;
  bio: string;
  years_experience: number;
  hourly_rate: number; // cents
  location_city: string;
  location_state: string;
  latitude: number | null;
  longitude: number | null;
  specialties: string[]; // parsed from JSON array
  certifications: string[];
  languages: string[];
  is_available: boolean;
  rating_avg: number;
  review_count: number;
  created_at: string;
  updated_at: string;
}

export const caregiverProfileSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  bio: z.string(),
  years_experience: z.number().int().min(0),
  hourly_rate: z.number().int().min(0),
  location_city: z.string(),
  location_state: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  specialties: z.array(z.string()),
  certifications: z.array(z.string()),
  languages: z.array(z.string()),
  is_available: z.boolean(),
  rating_avg: z.number().min(0).max(5),
  review_count: z.number().int().min(0),
  created_at: z.string(),
  updated_at: z.string(),
});

// Availability Slot

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface AvailabilitySlot {
  id: string;
  caregiver_id: string;
  day_of_week: DayOfWeek;
  start_time: string; // "08:00"
  end_time: string;   // "18:00"
  is_recurring: boolean;
  specific_date: string | null;
}

export const availabilitySlotSchema = z.object({
  id: z.string().uuid(),
  caregiver_id: z.string().uuid(),
  day_of_week: z.union([
    z.literal(0), z.literal(1), z.literal(2),
    z.literal(3), z.literal(4), z.literal(5), z.literal(6),
  ]),
  start_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: "Invalid time format (expected HH:mm)",
  }),
  end_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: "Invalid time format (expected HH:mm)",
  }),
  is_recurring: z.boolean(),
  specific_date: z.string().nullable(),
});

// Client Profile

export interface ClientProfile {
  id: string;
  user_id: string;
  care_recipient_name: string;
  care_recipient_age: number;
  care_needs: string[];
  location_city: string;
  location_state: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const clientProfileSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  care_recipient_name: z.string(),
  care_recipient_age: z.number().int().min(0),
  care_needs: z.array(z.string()),
  location_city: z.string(),
  location_state: z.string(),
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

// Booking

export type BookingStatus = "pending" | "accepted" | "declined" | "completed" | "cancelled";

export interface Booking {
  id: string;
  client_id: string;    // users.id (client)
  caregiver_id: string; // users.id (caregiver)
  status: BookingStatus;
  scheduled_date: string; // "YYYY-MM-DD"
  scheduled_start_time: string; // "HH:mm"
  scheduled_end_time: string;   // "HH:mm"
  location_city: string;
  location_state: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const bookingStatusEnum = z.enum([
  "pending",
  "accepted",
  "declined",
  "completed",
  "cancelled",
]);

export const bookingSchema = z.object({
  id: z.string().uuid(),
  client_id: z.string().uuid(),
  caregiver_id: z.string().uuid(),
  status: bookingStatusEnum,
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Invalid date format (expected YYYY-MM-DD)" }),
  scheduled_start_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: "Invalid time format (expected HH:mm)",
  }),
  scheduled_end_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: "Invalid time format (expected HH:mm)",
  }),
  location_city: z.string(),
  location_state: z.string(),
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

// Review

export interface Review {
  id: string;
  booking_id: string;
  client_id: string;
  caregiver_id: string;
  rating: number; // 1-5
  comment: string | null;
  created_at: string;
  updated_at: string;
}

export const reviewSchema = z.object({
  id: z.string().uuid(),
  booking_id: z.string().uuid(),
  client_id: z.string().uuid(),
  caregiver_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

// File Upload (e.g. Avatar/Profile Photo)

export interface FileUpload {
  key: string;        // R2 object key
  url: string;        // public URL
  mime_type: string;
  size: number;       // bytes
  uploaded_at: string;// ISO string
}

export const fileUploadSchema = z.object({
  key: z.string(),
  url: z.string().url(),
  mime_type: z.string(),
  size: z.number().int().min(0),
  uploaded_at: z.string(),
});

// --- API Contract Types ---

// Auth

export interface AuthLoginRequest {
  email: string;
  password: string;
  role: UserRole;
}

export const authLoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  role: userRoleEnum,
});

export interface AuthRegisterRequest {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
}

export const authRegisterRequestSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  full_name: z.string(),
  role: userRoleEnum,
});

// Search/filter types

export interface CaregiverSearchFilters {
  location_city?: string;
  location_state?: string;
  specialties?: string[];
  min_experience?: number;
  min_rating?: number;
  is_available?: boolean;
  languages?: string[];
  certifications?: string[];
}

export const caregiverSearchFiltersSchema = z.object({
  location_city: z.string().optional(),
  location_state: z.string().optional(),
  specialties: z.array(z.string()).optional(),
  min_experience: z.number().int().min(0).optional(),
  min_rating: z.number().min(0).max(5).optional(),
  is_available: z.boolean().optional(),
  languages: z.array(z.string()).optional(),
  certifications: z.array(z.string()).optional(),
});

// Utility types

export type WithId<T> = T & { id: string };

// Exports
export {
  userSchema,
  caregiverProfileSchema,
  availabilitySlotSchema,
  clientProfileSchema,
  bookingSchema,
  reviewSchema,
  fileUploadSchema,
  userRoleEnum,
  bookingStatusEnum,
  authLoginRequestSchema,
  authRegisterRequestSchema,
  caregiverSearchFiltersSchema,
};