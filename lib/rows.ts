// ROW SHAPES: Zod schemas for what comes BACK from PostgreSQL (the Day 16
// pattern). The driver types every row as Record<string, any>; parsing at
// the boundary turns that into real types, and a renamed column fails
// loudly right at the query instead of as `undefined` somewhere else.
//
// The driver already turns timestamptz into a JavaScript Date, and the
// queries alias snake_case columns to camelCase (`created_at AS "createdAt"`).
import 'server-only'

import { z } from 'zod'
import { AUTH_EVENT_TYPES } from '@/lib/auth/event-types'
import { roleSchema } from '@/lib/validation'

/** Parses rows at the boundary; a mismatch names the query that caused it. */
export function parseRows<T>(schema: z.ZodType<T>, rows: unknown[], query: string): T[] {
  const parsed = z.array(schema).safeParse(rows)
  if (!parsed.success) {
    throw new Error(`Rows from ${query} didn't match the expected shape: ${z.prettifyError(parsed.error)}`)
  }
  return parsed.data
}

/** The signed-in user, as the rest of the app sees them. No password hash. */
export const UserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  role: roleSchema,
  emailVerifiedAt: z.date().nullable(),
  createdAt: z.date(),
})
export type User = z.infer<typeof UserSchema>

/** Only lib/users.ts and the login/password checks ever see this one. */
export const UserWithHashSchema = UserSchema.extend({ passwordHash: z.string() })
export type UserWithHash = z.infer<typeof UserWithHashSchema>

export const SessionSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{64}$/),
  userId: z.uuid(),
  createdAt: z.date(),
  expiresAt: z.date(),
  lastSeenAt: z.date(),
  userAgent: z.string().nullable(),
  ip: z.string().nullable(),
  location: z.string().nullable(),
})
export type Session = z.infer<typeof SessionSchema>

export const AuthEventSchema = z.object({
  id: z.string(),
  type: z.enum(AUTH_EVENT_TYPES),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.date(),
  actorName: z.string().nullable(),
})
export type AuthEvent = z.infer<typeof AuthEventSchema>

export const AdminUserSchema = UserSchema.extend({
  lastLoginAt: z.date().nullable(),
  activeSessions: z.number().int(),
})
export type AdminUser = z.infer<typeof AdminUserSchema>
