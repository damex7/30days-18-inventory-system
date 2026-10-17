// THE LEDGER, read side. Rows are only ever inserted (lib/inventory/stock.ts)
// and never updated or deleted; a trigger enforces that (db/migrations/010).
import 'server-only'

import { sql } from '@/lib/db'
import { MovementSchema, parseRows, type Movement } from './rows'
import type { MovementListParams } from './validation'

export const MOVEMENT_PAGE_SIZE = 30
export const MOVEMENT_EXPORT_LIMIT = 20_000

const movementColumns = () => sql`
  m.id::text AS id, m.product_id AS "productId", p.name AS "productName", p.sku::text AS "productSku",
  p.unit AS "productUnit", p.archived_at IS NOT NULL AS "productArchived",
  m.location_id AS "locationId", l.name::text AS "locationName",
  m.type, m.quantity_change AS "quantityChange", m.quantity_after AS "quantityAfter",
  m.unit_cost_kobo AS "unitCostKobo", m.supplier_id AS "supplierId", s.name::text AS "supplierName",
  m.reference, m.note, m.user_id AS "userId", u.name AS "userName",
  m.transfer_id AS "transferId", m.created_at AS "createdAt"`

/**
 * Archived products, suppliers and locations still appear here: archiving
 * only hides them from lists and forms, and history must stay complete.
 */
const movementFrom = () => sql`
  FROM stock_movements m
  JOIN products p ON p.id = m.product_id
  JOIN locations l ON l.id = m.location_id
  JOIN users u ON u.id = m.user_id
  LEFT JOIN suppliers s ON s.id = m.supplier_id`

/**
 * Filters from the URL. Dates are calendar days IN LAGOS: "from 1 Oct"
 * means from midnight West Africa Time, whatever time zone the database
 * or the server runs in. `date::timestamp AT TIME ZONE 'Africa/Lagos'`
 * turns "2026-10-01 00:00 in Lagos" into the exact instant to compare
 * against created_at (a timestamptz). "to" includes the whole day, so it
 * compares with the NEXT midnight.
 */
function filters(params: Omit<MovementListParams, 'page'>) {
  return sql`
    WHERE true
      ${params.type ? sql`AND m.type = ${params.type}` : sql``}
      ${params.product ? sql`AND m.product_id = ${params.product}` : sql``}
      ${params.location ? sql`AND m.location_id = ${params.location}` : sql``}
      ${params.user ? sql`AND m.user_id = ${params.user}` : sql``}
      ${params.from ? sql`AND m.created_at >= (${params.from}::date)::timestamp AT TIME ZONE 'Africa/Lagos'` : sql``}
      ${params.to ? sql`AND m.created_at < (${params.to}::date + 1)::timestamp AT TIME ZONE 'Africa/Lagos'` : sql``}`
}

/**
 * One page of the ledger, newest first. (created_at, id) is the order of
 * stock_movements_created_idx, and the product/location/user filters each
 * have their own (…, created_at DESC) index, so PostgreSQL reads the
 * newest matching rows straight from an index and stops after one page.
 */
export async function listMovements(params: MovementListParams, pageSize = MOVEMENT_PAGE_SIZE): Promise<{ movements: Movement[]; total: number }> {
  const rows = await sql`
    SELECT ${movementColumns()}, count(*) OVER () AS "totalRows"
    ${movementFrom()}
    ${filters(params)}
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT ${pageSize} OFFSET ${(params.page - 1) * pageSize}`
  return { movements: parseRows(MovementSchema, rows, 'listMovements'), total: Number(rows[0]?.totalRows ?? 0) }
}

/** Every matching movement (no paging), oldest first, for the CSV export. */
export async function listMovementsForExport(params: MovementListParams): Promise<Movement[]> {
  const rows = await sql`
    SELECT ${movementColumns()}
    ${movementFrom()}
    ${filters(params)}
    ORDER BY m.created_at, m.id
    LIMIT ${MOVEMENT_EXPORT_LIMIT}`
  return parseRows(MovementSchema, rows, 'listMovementsForExport')
}

/** The newest few, for the dashboard. */
export async function recentMovements(limit = 10): Promise<Movement[]> {
  const rows = await sql`
    SELECT ${movementColumns()} ${movementFrom()}
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT ${limit}`
  return parseRows(MovementSchema, rows, 'recentMovements')
}

/** A supplier's latest deliveries (receipts), via the partial supplier index. */
export async function supplierDeliveries(supplierId: number, limit = 15): Promise<Movement[]> {
  const rows = await sql`
    SELECT ${movementColumns()} ${movementFrom()}
    WHERE m.supplier_id = ${supplierId}
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT ${limit}`
  return parseRows(MovementSchema, rows, 'supplierDeliveries')
}
