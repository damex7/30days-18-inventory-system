// REPORTS: the dashboard's figures and the low-stock list.
import 'server-only'

import { z } from 'zod'
import { sql } from '@/lib/db'
import { UNITS } from './constants'
import { count, kobo, parseRows } from './rows'

const SummarySchema = z.object({
  products: count,
  units: count,
  costValue: kobo,
  retailValue: kobo,
  low: count,
  out: count,
})
export type DashboardSummary = z.infer<typeof SummarySchema>

/**
 * Every dashboard figure in ONE query over the active products.
 * - Stock value = Σ quantity × price, computed in SQL on integer kobo
 *   (bigint × integer gives an exact numeric), never as floats.
 * - FILTER (WHERE …) counts several things in a single pass, instead of
 *   one query per tile.
 * - "Low" means at or below the reorder level but not empty; "out" is 0.
 */
export async function dashboardSummary(): Promise<DashboardSummary> {
  const rows = await sql`
    SELECT count(*) AS products,
           COALESCE(sum(lv.total), 0) AS units,
           COALESCE(sum(lv.total * p.cost_price_kobo), 0) AS "costValue",
           COALESCE(sum(lv.total * p.selling_price_kobo), 0) AS "retailValue",
           count(*) FILTER (WHERE lv.total > 0 AND lv.total <= p.reorder_level) AS low,
           count(*) FILTER (WHERE lv.total <= 0) AS out
    FROM products p
    CROSS JOIN LATERAL (SELECT COALESCE(sum(quantity), 0) AS total FROM stock_levels WHERE product_id = p.id) lv
    WHERE p.archived_at IS NULL`
  const summary = parseRows(SummarySchema, rows, 'dashboardSummary')[0]
  if (!summary) throw new Error('dashboardSummary returned no row')
  return summary
}

const LowStockRowSchema = z.object({
  id: z.number().int(),
  sku: z.string(),
  name: z.string(),
  unit: z.enum(UNITS),
  reorderLevel: z.number().int(),
  costPriceKobo: kobo,
  total: count,
  byLocation: z.record(z.string(), z.number().int()),
  supplierId: z.number().int().nullable(),
  supplierName: z.string().nullable(),
  supplierPhone: z.string().nullable(),
  supplierContact: z.string().nullable(),
  supplierArchived: z.boolean(),
})
export type LowStockRow = z.infer<typeof LowStockRowSchema>

/**
 * Everything at or below its reorder level (out-of-stock included), sorted
 * so it can be grouped by default supplier: suppliers by name, "no default
 * supplier" last, and within each, empty shelves first.
 */
export async function lowStockReport(): Promise<LowStockRow[]> {
  const rows = await sql`
    SELECT p.id, p.sku::text AS sku, p.name, p.unit, p.reorder_level AS "reorderLevel",
           p.cost_price_kobo AS "costPriceKobo", lv.total, lv.by_location AS "byLocation",
           s.id AS "supplierId", s.name::text AS "supplierName", s.phone AS "supplierPhone",
           s.contact_person AS "supplierContact", COALESCE(s.archived_at IS NOT NULL, false) AS "supplierArchived"
    FROM products p
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    CROSS JOIN LATERAL (
      SELECT COALESCE(sum(quantity), 0) AS total,
             COALESCE(jsonb_object_agg(location_id, quantity), '{}'::jsonb) AS by_location
      FROM stock_levels WHERE product_id = p.id
    ) lv
    WHERE p.archived_at IS NULL AND lv.total <= p.reorder_level
    ORDER BY s.name NULLS LAST, lv.total > 0, p.name`
  return parseRows(LowStockRowSchema, rows, 'lowStockReport')
}
