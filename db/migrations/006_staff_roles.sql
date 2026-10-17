-- 006: from "anyone can sign up" (Day 17) to "staff accounts of one shop".
--
-- Migrations 001-005 are copied from Day 17 unchanged. Applied migrations
-- are history, so the changes for this app go in a NEW file rather than
-- edits to the old ones. A database that already ran 001-005 gets exactly
-- the same result as a fresh one.

-- ROLES: 'user' becomes 'staff'. Drop the old CHECK first, move any
-- existing rows over, then add the new CHECK, so no row is ever invalid.
-- (users_role_check is the name PostgreSQL gave the inline CHECK in 001.)
ALTER TABLE users DROP CONSTRAINT users_role_check;
UPDATE users SET role = 'staff' WHERE role = 'user';
ALTER TABLE users
  ALTER COLUMN role SET DEFAULT 'staff',
  ADD CONSTRAINT users_role_check CHECK (role IN ('staff', 'admin'));

ALTER TABLE users
  -- Set when an admin creates the account with a temporary password. Until
  -- the person picks their own, every page sends them to
  -- /account/password (lib/auth/dal.ts). The admin saw the temporary
  -- password, so it must not stay in use.
  ADD COLUMN must_change_password boolean NOT NULL DEFAULT false,

  -- DEACTIVATED, not deleted. Every stock movement records who made it
  -- (stock_movements.user_id, ON DELETE RESTRICT), and that history must
  -- survive a staff member leaving. A deactivated user's sessions are
  -- deleted in the same transaction, readSession ignores them, and login
  -- refuses them. A timestamp rather than a boolean records WHEN.
  ADD COLUMN deactivated_at timestamptz NULL;

-- New audit event types for admin-created accounts and (de)activation.
-- The old types stay in the list, so existing rows remain valid.
ALTER TABLE auth_events DROP CONSTRAINT auth_events_type_check;
ALTER TABLE auth_events ADD CONSTRAINT auth_events_type_check CHECK (type IN (
  'signed_up', 'email_verified', 'logged_in', 'login_failed', 'logged_out',
  'password_changed', 'password_reset_requested', 'password_reset',
  'session_revoked', 'role_changed', 'profile_updated', 'account_deleted',
  'user_created', 'user_deactivated', 'user_reactivated'
));
