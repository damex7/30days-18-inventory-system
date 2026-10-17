// The kinds of audit event, matching the CHECK constraint in
// db/migrations/004_auth_events.sql, with the label each one gets on
// /account/activity. Plain data, so client and server code can both use it.

export const AUTH_EVENT_TYPES = [
  'signed_up',
  'email_verified',
  'logged_in',
  'login_failed',
  'logged_out',
  'password_changed',
  'password_reset_requested',
  'password_reset',
  'session_revoked',
  'role_changed',
  'profile_updated',
  'account_deleted',
] as const
export type AuthEventType = (typeof AUTH_EVENT_TYPES)[number]

export const EVENT_LABELS: Record<AuthEventType, string> = {
  signed_up: 'Account created',
  email_verified: 'Email address confirmed',
  logged_in: 'Signed in',
  login_failed: 'Failed sign-in attempt',
  logged_out: 'Signed out',
  password_changed: 'Password changed',
  password_reset_requested: 'Password reset link requested',
  password_reset: 'Password reset with an email link',
  session_revoked: 'Session signed out remotely',
  role_changed: 'Role changed',
  profile_updated: 'Profile updated',
  account_deleted: 'Account deleted',
}

/** Events worth drawing attention to on the activity page. */
export const WARNING_EVENTS: ReadonlySet<AuthEventType> = new Set(['login_failed', 'password_reset', 'role_changed'])
