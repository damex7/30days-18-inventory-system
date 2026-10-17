// LOCATIONS: the shop floor, the store room, and any others an admin adds.
// (The rules at the top of ./categories.ts apply here too.)
import 'server-only'

import { sql } from '@/lib/db'
import { isReferencedError, isUniqueError } from '@/lib/db-errors'
import { LocationSchema, OptionSchema, parseRows, type Location, type Option } from './rows'

const columns = () => sql`
  l.id, l.name::text AS name, l.archived_at AS "archivedAt", l.created_at AS "createdAt",
  (SELECT COALESCE(sum(sl.quantity), 0) FROM stock_levels sl WHERE sl.location_id = l.id) AS units,
  (SELECT count(*) FROM stock_levels sl WHERE sl.location_id = l.id AND sl.quantity > 0) AS "productsStocked",
  (SELECT count(*) FROM stock_movements m WHERE m.location_id = l.id) AS movements`

export async function listLocations(): Promise<Location[]> {
  const rows = await sql`SELECT ${columns()} FROM locations l ORDER BY l.archived_at IS NOT NULL, l.id`
  return parseRows(LocationSchema, rows, 'listLocations')
}

export async function getLocation(id: number): Promise<Location | null> {
  const rows = await sql`SELECT ${columns()} FROM locations l WHERE l.id = ${id}`
  return parseRows(LocationSchema, rows, 'getLocation')[0] ?? null
}

/** Active locations, in a fixed order (the order they were added): the columns of the products table. */
export async function locationOptions(): Promise<Option[]> {
  const rows = await sql`
    SELECT id, name::text AS name, false AS archived FROM locations
    WHERE archived_at IS NULL ORDER BY id`
  return parseRows(OptionSchema, rows, 'locationOptions')
}

export type SaveResult = { ok: true; id: number } | { ok: false; reason: 'duplicate' | 'missing' }

/**
 * A new location. The trigger from db/migrations/009 gives every existing
 * product a stock row here (quantity 0) in the same statement, so stock
 * can be received at it straight away.
 */
export async function createLocation(name: string): Promise<SaveResult> {
  try {
    const rows = await sql`INSERT INTO locations (name) VALUES (${name}) RETURNING id`
    return { ok: true, id: Number(rows[0]?.id) }
  } catch (error) {
    if (isUniqueError(error, 'locations_name_key')) return { ok: false, reason: 'duplicate' }
    throw error
  }
}

export async function renameLocation(id: number, name: string): Promise<SaveResult> {
  try {
    const rows = await sql`UPDATE locations SET name = ${name} WHERE id = ${id} RETURNING id`
    return rows.length ? { ok: true, id } : { ok: false, reason: 'missing' }
  } catch (error) {
    if (isUniqueError(error, 'locations_name_key')) return { ok: false, reason: 'duplicate' }
    throw error
  }
}

export type ArchiveResult = { ok: true } | { ok: false; reason: 'missing' } | { ok: false; reason: 'has-stock'; units: number } | { ok: false; reason: 'last-location' }

/**
 * Archiving a location that still holds stock would make those goods
 * vanish from every list, so it's refused while any quantity there is
 * above 0. The condition is IN the UPDATE (NOT EXISTS ...), so the check
 * and the change are one atomic step. The last active location can't be
 * archived either: stock needs somewhere to be.
 */
export async function setLocationArchived(id: number, archived: boolean): Promise<ArchiveResult> {
  const rows = archived
    ? await sql`
        UPDATE locations SET archived_at = COALESCE(archived_at, now())
        WHERE id = ${id}
          AND NOT EXISTS (SELECT 1 FROM stock_levels WHERE location_id = ${id} AND quantity > 0)
          AND EXISTS (SELECT 1 FROM locations WHERE archived_at IS NULL AND id <> ${id})
        RETURNING id`
    : await sql`UPDATE locations SET archived_at = NULL WHERE id = ${id} RETURNING id`
  if (rows.length) return { ok: true }

  const location = await getLocation(id)
  if (!location) return { ok: false, reason: 'missing' }
  if (location.units > 0) return { ok: false, reason: 'has-stock', units: location.units }
  return { ok: false, reason: 'last-location' }
}

export type DeleteResult = { ok: true } | { ok: false; reason: 'missing' } | { ok: false; reason: 'has-history'; movements: number }

/**
 * Tries the DELETE. A location with movements is protected by
 * stock_movements.location_id ON DELETE RESTRICT. One without movements
 * can only hold zero stock, and its zero stock rows go with it
 * (stock_levels.location_id ON DELETE CASCADE).
 */
export async function deleteLocation(id: number): Promise<DeleteResult> {
  try {
    const rows = await sql`DELETE FROM locations WHERE id = ${id} RETURNING id`
    return rows.length ? { ok: true } : { ok: false, reason: 'missing' }
  } catch (error) {
    if (!isReferencedError(error)) throw error
    const rows = await sql`SELECT count(*) AS n FROM stock_movements WHERE location_id = ${id}`
    return { ok: false, reason: 'has-history', movements: Number(rows[0]?.n ?? 0) }
  }
}
