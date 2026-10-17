// THE AUDIT LOG: writes and reads auth_events (db/migrations/004).
import 'server-only'

import type { NeonQueryFunctionInTransaction, NeonQueryInTransaction } from '@neondatabase/serverless'
import { sql, sqlTransaction } from '@/lib/db'
import { AuthEventSchema, parseRows, type AuthEvent } from '@/lib/rows'
import type { AuthEventType } from './event-types'
import type { RequestInfo } from './request'

export type TxQuery = NeonQueryFunctionInTransaction<false, false>

export type NewAuthEvent = {
  type: AuthEventType
  /** The account the event is about (null when unknown, e.g. a failed login for no account). */
  userId: string | null
  /** The admin who acted, when it wasn't the user themselves. */
  actorId?: string | null
  request: RequestInfo
  metadata?: Record<string, string | number | boolean | null>
}

/**
 * The INSERT as one query inside sqlTransaction([...]), so the event
 * commits together with the change it describes, or not at all.
 */
export function eventQuery(tx: TxQuery, event: NewAuthEvent): NeonQueryInTransaction {
  return tx`INSERT INTO auth_events (user_id, actor_id, type, ip, user_agent, metadata)
            VALUES (${event.userId}, ${event.actorId ?? null}, ${event.type}, ${event.request.ip},
                    ${event.request.userAgent}, ${JSON.stringify(event.metadata ?? {})}::jsonb)`
}

/** Records one event on its own (still one HTTPS request). */
export async function recordEvent(event: NewAuthEvent): Promise<void> {
  await sqlTransaction((tx) => [eventQuery(tx, event)])
}

/** One user's newest events, for /account/activity. An index range scan on auth_events_user_created_idx. */
export async function listEventsForUser(userId: string, limit = 50): Promise<AuthEvent[]> {
  const rows = await sql`
    SELECT e.id::text AS id, e.type, e.ip, e.user_agent AS "userAgent", e.metadata,
           e.created_at AS "createdAt", a.name AS "actorName"
    FROM auth_events e LEFT JOIN users a ON a.id = e.actor_id
    WHERE e.user_id = ${userId}
    ORDER BY e.created_at DESC
    LIMIT ${limit}`
  return parseRows(AuthEventSchema, rows, 'listEventsForUser')
}
