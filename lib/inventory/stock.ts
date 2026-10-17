// STOCK CHANGES: the heart of Day 18.
//
// Every change to a quantity is ONE TRANSACTION that does two things
// together: update stock_levels AND insert the stock_movements row that
// explains it. Both happen, or neither does.
//
// HOW "NEVER BELOW ZERO" IS GUARANTEED, even when two staff sell the last
// tin of Peak milk at the same moment. Two layers:
//
// 1. THE CONDITIONAL UPDATE (the real guard):
//      UPDATE stock_levels SET quantity = quantity + $change
//      WHERE product_id = $p AND location_id = $l AND quantity + $change >= 0
//      RETURNING quantity
//    An UPDATE LOCKS the row it changes until the transaction ends. If two
//    sales arrive together, the second one WAITS for the first to commit,
//    then PostgreSQL re-checks the WHERE against the row as the first one
//    left it (READ COMMITTED's "re-check on the newest version"). With 1
//    tin: the first makes it 0; the second re-checks 0 − 1 >= 0, finds it
//    false, and updates NOTHING. The movement INSERT reads FROM the
//    UPDATE's RETURNING, so no updated row means no movement either.
//    Checking in JavaScript first ("SELECT quantity, then UPDATE if enough")
//    would NOT be safe: both requests could read 1 before either writes.
//
// 2. THE CHECK CONSTRAINT (the safety net): stock_levels.quantity has
//    CHECK (quantity >= 0) (db/migrations/009). If any query anywhere, a
//    future feature, a script, a console session, ever forgets the WHERE
//    guard, PostgreSQL refuses the change with error 23514 and the whole
//    transaction (movement included) rolls back.
//
// ONE ROUND TRIP. sqlTransaction (lib/db.ts) sends the whole transaction
// as one HTTPS request (about 250 ms from Nigeria to the database, so
// round trips matter). JavaScript can't look at statement 1's result
// before statement 2 is sent, which is why the decision "was there enough
// stock?" is made INSIDE statement 1, with a data-modifying CTE.
import 'server-only'

import { randomUUID } from 'node:crypto'
import { sqlTransaction } from '@/lib/db'
import { isCheckError, isReferencedError } from '@/lib/db-errors'
import type { TxQuery } from '@/lib/auth/events'
import { z } from 'zod'
import { UNITS, type Unit } from './constants'
import { parseRows } from './rows'
import type { MovementInput } from './validation'

/** What statement 2 reads back: the levels involved, AFTER statement 1. */
const LevelRowSchema = z.object({
  locationId: z.number().int(),
  locationName: z.string(),
  locationArchived: z.boolean(),
  productName: z.string(),
  productUnit: z.enum(UNITS),
  productArchived: z.boolean(),
  quantity: z.number().int(),
})
type LevelRow = z.infer<typeof LevelRowSchema>

const InsertedSchema = z.object({ id: z.string(), locationId: z.number().int(), quantityChange: z.number().int(), quantityAfter: z.number().int() })

export type StockResult =
  | {
      ok: true
      productName: string
      unit: Unit
      /** One row per ledger entry written (two for a transfer). */
      changes: { locationName: string; quantityChange: number; quantityAfter: number }[]
    }
  | { ok: false; reason: 'insufficient'; productName: string; unit: Unit; locationName: string; available: number }
  | { ok: false; reason: 'unchanged'; productName: string; unit: Unit; locationName: string; quantity: number }
  | { ok: false; reason: 'archived' | 'not-found' | 'bad-reference' | 'refused' }

/**
 * Statement 2 of every stock transaction. A NEW statement takes a NEW
 * snapshot, so it sees what any competing sale just committed: "only 0
 * left" is the truth now, not the number statement 1 started from.
 */
function readLevels(tx: TxQuery, productId: number, locationIds: number[]) {
  return tx`
    SELECT sl.location_id AS "locationId", l.name::text AS "locationName", l.archived_at IS NOT NULL AS "locationArchived",
           p.name AS "productName", p.unit AS "productUnit", p.archived_at IS NOT NULL AS "productArchived",
           sl.quantity
    FROM stock_levels sl
    JOIN products p ON p.id = sl.product_id
    JOIN locations l ON l.id = sl.location_id
    WHERE sl.product_id = ${productId} AND sl.location_id = ANY(${locationIds}::int[])`
}

/**
 * Why statement 1 changed nothing: the product or location is gone or
 * archived, or there wasn't enough stock. `available` is the quantity
 * statement 2 saw, which includes any sale that won the race.
 */
function explainNothingChanged(levels: LevelRow[], locationId: number): StockResult {
  const level = levels.find((l) => l.locationId === locationId)
  if (!level) return { ok: false, reason: 'not-found' }
  if (levels.some((l) => l.productArchived || l.locationArchived)) return { ok: false, reason: 'archived' }
  return { ok: false, reason: 'insufficient', productName: level.productName, unit: level.productUnit, locationName: level.locationName, available: level.quantity }
}

function success(levels: LevelRow[], inserted: z.infer<typeof InsertedSchema>[]): StockResult {
  const first = levels[0]
  return {
    ok: true,
    productName: first?.productName ?? '',
    unit: first?.productUnit ?? 'piece',
    changes: inserted.map((row) => ({
      locationName: levels.find((l) => l.locationId === row.locationId)?.locationName ?? '',
      quantityChange: row.quantityChange,
      quantityAfter: row.quantityAfter,
    })),
  }
}

/** Runs a stock transaction, translating the errors we expect. */
async function run(build: (tx: TxQuery) => ReturnType<TxQuery>[]): Promise<{ inserted: z.infer<typeof InsertedSchema>[]; levels: LevelRow[] } | StockResult> {
  try {
    const [insertedRows, levelRows] = await sqlTransaction(build)
    return {
      inserted: parseRows(InsertedSchema, insertedRows ?? [], 'stock movement'),
      levels: parseRows(LevelRowSchema, levelRows ?? [], 'stock levels'),
    }
  } catch (error) {
    // The safety net fired (see the top of this file): the database refused
    // a quantity below zero and rolled everything back. Nothing was written.
    if (isCheckError(error, 'stock_levels_quantity_check')) return { ok: false, reason: 'refused' }
    // A supplier, product or location was deleted while the form was open.
    if (isReferencedError(error)) return { ok: false, reason: 'bad-reference' }
    throw error
  }
}

/**
 * Receive, sale, damage or return: one location, one signed change.
 * Receipts and returns add stock (+), sales and damage remove it (−).
 */
async function recordSimple(userId: string, input: Extract<MovementInput, { type: 'receive' | 'sale' | 'damage' | 'return' }>): Promise<StockResult> {
  const change = input.type === 'receive' || input.type === 'return' ? input.quantity : -input.quantity
  const unitCost = input.type === 'receive' ? input.unitCost : null
  const supplierId = input.type === 'receive' ? input.supplierId : null

  const result = await run((tx) => [
    // STATEMENT 1: the guarded UPDATE feeds the INSERT.
    tx`
      WITH changed AS (
        UPDATE stock_levels sl SET quantity = sl.quantity + ${change}::int
        FROM products p, locations l
        WHERE sl.product_id = ${input.productId} AND sl.location_id = ${input.locationId}
          AND p.id = sl.product_id AND p.archived_at IS NULL
          AND l.id = sl.location_id AND l.archived_at IS NULL
          AND sl.quantity + ${change}::int >= 0          -- THE GUARD
        RETURNING sl.quantity
      )
      INSERT INTO stock_movements
        (product_id, location_id, type, quantity_change, quantity_after, unit_cost_kobo, supplier_id, reference, note, user_id)
      SELECT ${input.productId}::int, ${input.locationId}::int, ${input.type}::text, ${change}::int, changed.quantity,
             ${unitCost}::bigint, ${supplierId}::int, ${input.reference}::text, ${input.note}::text, ${userId}::uuid
      FROM changed
      RETURNING id::text AS id, location_id AS "locationId", quantity_change AS "quantityChange", quantity_after AS "quantityAfter"`,
    // STATEMENT 2: read the level back with a fresh snapshot.
    readLevels(tx, input.productId, [input.locationId]),
  ])
  if ('ok' in result) return result
  if (result.inserted.length === 0) return explainNothingChanged(result.levels, input.locationId)
  return success(result.levels, result.inserted)
}

/**
 * A TRANSFER moves stock between two locations: two ledger rows, a
 * transfer_out and a transfer_in, sharing one transfer_id, and two stock
 * rows changed, all in ONE statement (so in one transaction).
 *
 * - `moved_out` is the guarded UPDATE at the source. It also requires the
 *   destination to exist and be active, so it can never take stock out
 *   with nowhere to put it.
 * - `moved_in` only runs if `moved_out` changed a row (EXISTS).
 * - The INSERT writes both halves from `both_sides`, which has a row only
 *   when BOTH updates did: one row in, two movements out, or none at all.
 */
async function recordTransfer(userId: string, input: Extract<MovementInput, { type: 'transfer' }>): Promise<StockResult> {
  const transferId = randomUUID()
  const { productId, fromLocationId: from, toLocationId: to, quantity } = input

  const result = await run((tx) => [
    tx`
      WITH moved_out AS (
        UPDATE stock_levels sl SET quantity = sl.quantity - ${quantity}::int
        FROM products p, locations l
        WHERE sl.product_id = ${productId} AND sl.location_id = ${from} AND ${from}::int <> ${to}::int
          AND p.id = sl.product_id AND p.archived_at IS NULL
          AND l.id = sl.location_id AND l.archived_at IS NULL
          AND sl.quantity - ${quantity}::int >= 0        -- THE GUARD
          AND EXISTS (SELECT 1 FROM stock_levels d JOIN locations dl ON dl.id = d.location_id
                      WHERE d.product_id = ${productId} AND d.location_id = ${to} AND dl.archived_at IS NULL)
        RETURNING sl.quantity
      ),
      moved_in AS (
        UPDATE stock_levels sl SET quantity = sl.quantity + ${quantity}::int
        WHERE sl.product_id = ${productId} AND sl.location_id = ${to}
          AND EXISTS (SELECT 1 FROM moved_out)
        RETURNING sl.quantity
      ),
      both_sides AS (
        SELECT o.quantity AS out_after, i.quantity AS in_after FROM moved_out o CROSS JOIN moved_in i
      )
      INSERT INTO stock_movements (product_id, location_id, type, quantity_change, quantity_after, note, user_id, transfer_id)
      SELECT ${productId}::int, ${from}::int, 'transfer_out', -${quantity}::int, out_after, ${input.note}::text, ${userId}::uuid, ${transferId}::uuid
      FROM both_sides
      UNION ALL
      SELECT ${productId}::int, ${to}::int, 'transfer_in', ${quantity}::int, in_after, ${input.note}::text, ${userId}::uuid, ${transferId}::uuid
      FROM both_sides
      RETURNING id::text AS id, location_id AS "locationId", quantity_change AS "quantityChange", quantity_after AS "quantityAfter"`,
    readLevels(tx, productId, [from, to]),
  ])
  if ('ok' in result) return result
  if (result.inserted.length === 0) {
    if (!result.levels.some((l) => l.locationId === to)) return { ok: false, reason: 'not-found' }
    return explainNothingChanged(result.levels, from)
  }
  return success(result.levels, result.inserted)
}

/**
 * An ADJUSTMENT (admin only): after counting the shelf, set the quantity
 * to what was counted. The app works out the difference and records it
 * with the required reason, so the ledger still explains every unit.
 *
 * `RETURNING old.quantity, new.quantity` (new in PostgreSQL 18) hands back
 * the row before AND after the change from the same UPDATE. Because the
 * UPDATE locks the row, "before" is the quantity actually replaced, even
 * if a sale landed a moment earlier. A count equal to the current stock
 * changes nothing (`<>` in the WHERE), so no zero-change movement is made.
 */
async function recordAdjustment(userId: string, input: Extract<MovementInput, { type: 'adjustment' }>): Promise<StockResult> {
  const { productId, locationId, countedQuantity } = input

  const result = await run((tx) => [
    tx`
      WITH changed AS (
        UPDATE stock_levels sl SET quantity = ${countedQuantity}::int
        FROM products p, locations l
        WHERE sl.product_id = ${productId} AND sl.location_id = ${locationId}
          AND p.id = sl.product_id AND p.archived_at IS NULL
          AND l.id = sl.location_id AND l.archived_at IS NULL
          AND sl.quantity <> ${countedQuantity}::int
        RETURNING old.quantity AS before, new.quantity AS after
      )
      INSERT INTO stock_movements (product_id, location_id, type, quantity_change, quantity_after, note, user_id)
      SELECT ${productId}::int, ${locationId}::int, 'adjustment', after - before, after, ${input.note}::text, ${userId}::uuid
      FROM changed
      RETURNING id::text AS id, location_id AS "locationId", quantity_change AS "quantityChange", quantity_after AS "quantityAfter"`,
    readLevels(tx, productId, [locationId]),
  ])
  if ('ok' in result) return result
  if (result.inserted.length === 0) {
    const level = result.levels[0]
    if (!level) return { ok: false, reason: 'not-found' }
    if (level.productArchived || level.locationArchived) return { ok: false, reason: 'archived' }
    return { ok: false, reason: 'unchanged', productName: level.productName, unit: level.productUnit, locationName: level.locationName, quantity: level.quantity }
  }
  return success(result.levels, result.inserted)
}

/** Records any movement from the "Record stock" form. The caller has already checked the role. */
export function recordMovement(userId: string, input: MovementInput): Promise<StockResult> {
  switch (input.type) {
    case 'transfer':
      return recordTransfer(userId, input)
    case 'adjustment':
      return recordAdjustment(userId, input)
    default:
      return recordSimple(userId, input)
  }
}
