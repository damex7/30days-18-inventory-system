// SUPPLIERS: create, read, update, archive, delete.
// (The rules at the top of ./categories.ts apply here too.)
import 'server-only'

import { sql } from '@/lib/db'
import { isReferencedError, isUniqueError } from '@/lib/db-errors'
import { OptionSchema, parseRows, SupplierListRowSchema, SupplierSchema, type Option, type Supplier, type SupplierListRow } from './rows'
import type { SupplierInput } from './validation'

const columns = () => sql`
  s.id, s.name::text AS name, s.contact_person AS "contactPerson", s.phone, s.email::text AS email,
  s.address, s.notes, s.archived_at AS "archivedAt", s.created_at AS "createdAt", s.updated_at AS "updatedAt"`

/**
 * The suppliers list, with how many products each one supplies and its
 * deliveries. The delivery counts use the partial index
 * stock_movements_supplier_created_idx (only receipts have a supplier).
 */
export async function listSuppliers(): Promise<SupplierListRow[]> {
  const rows = await sql`
    SELECT ${columns()},
           (SELECT count(*) FROM products p WHERE p.supplier_id = s.id AND p.archived_at IS NULL) AS products,
           (SELECT count(*) FROM stock_movements m WHERE m.supplier_id = s.id) AS deliveries,
           (SELECT max(m.created_at) FROM stock_movements m WHERE m.supplier_id = s.id) AS "lastDeliveryAt"
    FROM suppliers s
    ORDER BY s.archived_at IS NOT NULL, s.name`
  return parseRows(SupplierListRowSchema, rows, 'listSuppliers')
}

export async function getSupplier(id: number): Promise<Supplier | null> {
  const rows = await sql`SELECT ${columns()} FROM suppliers s WHERE s.id = ${id}`
  return parseRows(SupplierSchema, rows, 'getSupplier')[0] ?? null
}

/** For <select>s: active suppliers, plus one already chosen even if archived since. */
export async function supplierOptions(keepId: number | null = null): Promise<Option[]> {
  const rows = await sql`
    SELECT id, name::text AS name, archived_at IS NOT NULL AS archived
    FROM suppliers
    WHERE archived_at IS NULL OR id = ${keepId}
    ORDER BY name`
  return parseRows(OptionSchema, rows, 'supplierOptions')
}

export type SaveResult = { ok: true; id: number } | { ok: false; reason: 'duplicate' | 'missing' }

export async function createSupplier(input: SupplierInput): Promise<SaveResult> {
  try {
    const rows = await sql`
      INSERT INTO suppliers (name, contact_person, phone, email, address, notes)
      VALUES (${input.name}, ${input.contactPerson}, ${input.phone}, ${input.email}, ${input.address}, ${input.notes})
      RETURNING id`
    return { ok: true, id: Number(rows[0]?.id) }
  } catch (error) {
    if (isUniqueError(error, 'suppliers_name_key')) return { ok: false, reason: 'duplicate' }
    throw error
  }
}

export async function updateSupplier(id: number, input: SupplierInput): Promise<SaveResult> {
  try {
    const rows = await sql`
      UPDATE suppliers SET
        name = ${input.name}, contact_person = ${input.contactPerson}, phone = ${input.phone},
        email = ${input.email}, address = ${input.address}, notes = ${input.notes}
      WHERE id = ${id}
      RETURNING id`
    return rows.length ? { ok: true, id } : { ok: false, reason: 'missing' }
  } catch (error) {
    if (isUniqueError(error, 'suppliers_name_key')) return { ok: false, reason: 'duplicate' }
    throw error
  }
}

export async function setSupplierArchived(id: number, archived: boolean): Promise<boolean> {
  const rows = await sql`
    UPDATE suppliers SET archived_at = CASE WHEN ${archived}::boolean THEN COALESCE(archived_at, now()) ELSE NULL END
    WHERE id = ${id}
    RETURNING id`
  return rows.length > 0
}

export type DeleteResult = { ok: true } | { ok: false; reason: 'missing' } | { ok: false; reason: 'has-history'; deliveries: number }

/**
 * Tries the DELETE; the database decides.
 * - Deliveries in the ledger (stock_movements.supplier_id, ON DELETE
 *   RESTRICT) block it: history must keep saying who delivered. The
 *   caller offers to archive instead.
 * - Products that merely name it as their default supplier don't block it:
 *   products.supplier_id is ON DELETE SET NULL, so PostgreSQL clears it on
 *   those products in the same statement.
 */
export async function deleteSupplier(id: number): Promise<DeleteResult> {
  try {
    const rows = await sql`DELETE FROM suppliers WHERE id = ${id} RETURNING id`
    return rows.length ? { ok: true } : { ok: false, reason: 'missing' }
  } catch (error) {
    if (!isReferencedError(error)) throw error
    const rows = await sql`SELECT count(*) AS n FROM stock_movements WHERE supplier_id = ${id}`
    return { ok: false, reason: 'has-history', deliveries: Number(rows[0]?.n ?? 0) }
  }
}
