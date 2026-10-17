// USER ADMIN SERVER ACTIONS (admin only).
//
// Each one starts with requireRole('admin'): hiding the buttons from staff
// is only tidiness, because anyone signed in can send this POST with any
// user id. Every change is written to auth_events with the admin as actor.
'use server'

import { refresh } from 'next/cache'
import { after } from 'next/server'
import { fieldError, formValues, succeeded } from '@/lib/action-helpers'
import { requireRole } from '@/lib/auth/dal'
import { sendEmail, welcomeMessage } from '@/lib/auth/email'
import { hashPassword } from '@/lib/auth/password'
import { getRequestInfo } from '@/lib/auth/request'
import { generateTemporaryPassword } from '@/lib/auth/temp-password'
import { createEmailToken } from '@/lib/auth/tokens'
import { createStaffUser, setActive, setRole } from '@/lib/users'
import { changeRoleSchema, createStaffSchema, failed, field, invalid, setActiveSchema, type FormState } from '@/lib/validation'

type CreateField = 'name' | 'email' | 'role'

/** The answer after creating an account: includes the temporary password, shown ONCE. */
export type CreateStaffState = FormState<CreateField> & { created?: { name: string; email: string; tempPassword: string } }

/**
 * Creates an account with a random temporary password.
 * - The password is shown to the admin ONCE (in this response) to hand
 *   over in person; only its argon2id hash is stored. It's never emailed.
 * - must_change_password makes its owner choose their own at first sign-in.
 * - A "confirm your email" link is emailed after the response (after()), so
 *   the admin isn't kept waiting for the email service.
 */
export async function createStaffAction(_previous: CreateStaffState, formData: FormData): Promise<CreateStaffState> {
  const { user: admin } = await requireRole('admin')
  const values = formValues(formData, ['name', 'email', 'role'] as const)
  const parsed = createStaffSchema.safeParse(values)
  if (!parsed.success) return invalid(parsed.error, values)
  const { name, email, role } = parsed.data

  const tempPassword = generateTemporaryPassword()
  const userId = await createStaffUser(admin.id, { name, email, role, passwordHash: await hashPassword(tempPassword) }, await getRequestInfo())
  if (!userId) return fieldError('email', 'There’s already an account with that email address.', values)

  after(async () => {
    const token = await createEmailToken(userId, 'verify_email')
    await sendEmail(welcomeMessage(email, name, admin.name, token))
  })
  refresh()
  return { status: 'success', message: `Account created for ${name}.`, created: { name, email, tempPassword }, submissionId: Date.now() }
}

export async function changeRoleAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { user: admin } = await requireRole('admin')
  const parsed = changeRoleSchema.safeParse({ userId: field(formData, 'userId'), role: field(formData, 'role') })
  if (!parsed.success) return failed('That request wasn’t valid.')
  // Checked here for a clear message, and again in SQL (setRole's
  // `id <> actorId`), which is the check that can't be skipped.
  if (parsed.data.userId === admin.id) return failed('You can’t change your own role.')

  const changed = await setRole(admin.id, parsed.data.userId, parsed.data.role, await getRequestInfo())
  if (!changed) return failed('Nothing changed: they may already have that role.')
  refresh()
  return succeeded(parsed.data.role === 'admin' ? 'Now an admin.' : 'Now staff.')
}

/**
 * Deactivate (sign out everywhere, no more logins) or reactivate. Never
 * yourself: `id <> actorId` in setActive's SQL, so even a hand-made request
 * can't lock out the admin who sends it, and there is always an admin left.
 */
export async function setActiveAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { user: admin } = await requireRole('admin')
  const parsed = setActiveSchema.safeParse({ userId: field(formData, 'userId'), active: field(formData, 'active') })
  if (!parsed.success) return failed('That request wasn’t valid.')
  if (parsed.data.userId === admin.id) return failed('You can’t deactivate your own account.')

  const changed = await setActive(admin.id, parsed.data.userId, parsed.data.active, await getRequestInfo())
  if (!changed) return failed('Nothing changed.')
  refresh()
  return succeeded(parsed.data.active ? 'Reactivated. They can sign in again.' : 'Deactivated and signed out everywhere.')
}
