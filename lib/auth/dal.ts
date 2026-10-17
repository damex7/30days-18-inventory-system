// THE DATA ACCESS LAYER (DAL): the ONE place that decides "who is this, and
// are they allowed?". Every protected page, Server Action and route handler
// starts by calling verifySession() or requireRole() from here.
//
// Why here and not only in proxy.ts? The proxy runs before a page and only
// checks that a cookie EXISTS (it can't afford a database trip on every
// request, including images and prefetches). An expired, revoked or forged
// cookie passes that check. Also, Server Actions are POST requests to the
// page's URL, and a bug in a matcher can silently skip a route. So the proxy
// is a convenience for fast redirects; the real check is here, next to the
// data, every time.
import 'server-only'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import type { Role } from '@/lib/validation'
import { SESSION_COOKIE } from './cookie'
import { readSession, type SessionWithUser } from './session'

export type { SessionWithUser }

/**
 * The current session and user, or null when signed out.
 *
 * React's cache() MEMOISES it for the length of ONE request: the header,
 * the page and three components can all call it, and the database is asked
 * once (so sliding renewal also happens at most once per request). The next
 * request starts fresh, so a revoked session is rejected right away.
 *
 * Why not 'use cache: private' (which the Next.js docs suggest for session
 * reads)? That keeps the result in the BROWSER for up to 5 minutes, so a
 * session revoked from another device, or by an admin, would keep working
 * here for those 5 minutes. For a security decision we want every request
 * to ask the database.
 */
export const getCurrentSession = cache(async (): Promise<SessionWithUser | null> => readSession())

/** Where to send someone who needs to sign in, remembering where they were going. */
async function loginUrl(): Promise<string> {
  // proxy.ts copies the requested path into this header for us.
  const path = (await headers()).get('x-ipamo-path')
  const hadCookie = (await cookies()).has(SESSION_COOKIE)
  const params = new URLSearchParams()
  if (path) params.set('next', path)
  // A cookie that no longer matches a session: it expired or was revoked.
  if (hadCookie) params.set('reason', 'ended')
  const query = params.toString()
  return query ? `/login?${query}` : '/login'
}

/**
 * Returns the signed-in user and session, or REDIRECTS to /login.
 * redirect() throws, so code after this line only runs for a signed-in user.
 */
export async function verifySession(): Promise<SessionWithUser> {
  const current = await getCurrentSession()
  if (!current) redirect(await loginUrl())
  return current
}

/** Like verifySession, and also requires a confirmed email address. */
export async function requireVerified(): Promise<SessionWithUser> {
  const current = await verifySession()
  if (!current.user.emailVerifiedAt) redirect('/dashboard?denied=verify')
  return current
}

/**
 * Requires a role. Admin pages and actions need BOTH the admin role and a
 * verified email: an admin account that hasn't proved it owns its inbox
 * could belong to someone who typed a colleague's address at sign-up.
 * The role is read fresh from the database on every request (it's part of
 * readSession's JOIN), so a demotion takes effect immediately.
 */
export async function requireRole(role: Role): Promise<SessionWithUser> {
  const current = await verifySession()
  if (role === 'admin') {
    if (current.user.role !== 'admin') redirect('/dashboard?denied=admin')
    if (!current.user.emailVerifiedAt) redirect('/dashboard?denied=verify')
  }
  return current
}
