// CSV IMPORT of products (admin only): check every row first, show the
// result, then insert only the valid rows, all in ONE statement (so one
// transaction: all of them go in, or none do).
import 'server-only'

import { z } from 'zod'
import { sql } from '@/lib/db'
import { parseCsv } from './csv'
import { productSchema, type ProductInput } from './validation'

export const IMPORT_COLUMNS = ['sku', 'name', 'category', 'supplier', 'unit', 'cost_price', 'selling_price', 'reorder_level'] as const
type Column = (typeof IMPORT_COLUMNS)[number]
export const MAX_IMPORT_BYTES = 1_000_000
export const MAX_IMPORT_ROWS = 1_000

export type ImportRow = {
  /** The line in the file (the header is line 1). */
  line: number
  values: Record<Column, string>
  errors: string[]
  /** Set when the row is valid: exactly what will be inserted. */
  product?: ProductInput
}

export type ImportCheck = { ok: false; message: string } | { ok: true; rows: ImportRow[]; valid: number }

const FIELD_NAMES: Record<string, string> = {
  sku: 'SKU',
  name: 'Name',
  categoryId: 'Category',
  supplierId: 'Supplier',
  unit: 'Unit',
  costPrice: 'Cost price',
  sellingPrice: 'Selling price',
  reorderLevel: 'Reorder level',
}

/**
 * Reads the CSV and checks every row against the SAME rules as the product
 * form (productSchema), plus things only an import can get wrong: an unknown
 * category or supplier name, a SKU repeated in the file, or a SKU that
 * already exists. Nothing is written here.
 */
export async function checkImport(text: string): Promise<ImportCheck> {
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, message: 'That file is over 1 MB. Split it into smaller files.' }
  const table = parseCsv(text)
  const [header, ...body] = table
  if (!header) return { ok: false, message: 'The file is empty.' }
  if (body.length === 0) return { ok: false, message: 'The file has a header row but no products.' }
  if (body.length > MAX_IMPORT_ROWS) return { ok: false, message: `That’s ${body.length} rows; the limit is ${MAX_IMPORT_ROWS} per import.` }

  // Columns are found by NAME (any order, any capitals), so a file saved
  // from Excel with reordered columns still works.
  const index = new Map(header.map((name, i) => [name.trim().toLowerCase().replace(/\s+/g, '_'), i]))
  const missing = IMPORT_COLUMNS.filter((c) => c !== 'supplier' && !index.has(c))
  if (missing.length) return { ok: false, message: `Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Download the template to see the expected header.` }

  // Everything the checks need, in three small queries sent together.
  const skus = body.map((row) => (row[index.get('sku') ?? -1] ?? '').trim()).filter(Boolean)
  const [categories, suppliers, existing] = await Promise.all([
    sql`SELECT id, lower(name::text) AS name FROM categories WHERE archived_at IS NULL`,
    sql`SELECT id, lower(name::text) AS name FROM suppliers WHERE archived_at IS NULL`,
    sql`SELECT lower(sku::text) AS sku FROM products WHERE sku = ANY(${skus}::citext[])`,
  ])
  const categoryId = new Map(categories.map((c) => [String(c.name), String(c.id)]))
  const supplierId = new Map(suppliers.map((s) => [String(s.name), String(s.id)]))
  const taken = new Set(existing.map((e) => String(e.sku)))
  const seen = new Set<string>()

  const rows: ImportRow[] = body.map((cells, i) => {
    const values = Object.fromEntries(IMPORT_COLUMNS.map((c) => [c, (cells[index.get(c) ?? -1] ?? '').trim()])) as Record<Column, string>
    const errors: string[] = []

    const category = categoryId.get(values.category.toLowerCase())
    if (values.category && !category) errors.push(`Category “${values.category}” doesn’t exist (or is archived). Add it first.`)
    const supplier = values.supplier ? supplierId.get(values.supplier.toLowerCase()) : ''
    if (values.supplier && !supplier) errors.push(`Supplier “${values.supplier}” doesn’t exist (or is archived).`)

    const parsed = productSchema.safeParse({
      sku: values.sku,
      name: values.name,
      categoryId: category ?? '',
      supplierId: supplier ?? '',
      unit: values.unit.toLowerCase(),
      costPrice: values.cost_price,
      sellingPrice: values.selling_price,
      reorderLevel: values.reorder_level || '0',
    })
    if (!parsed.success) {
      for (const [key, messages] of Object.entries(z.flattenError(parsed.error).fieldErrors)) {
        // An unknown category is already explained above in its own words.
        if (key === 'categoryId' && values.category && !category) continue
        if (messages?.[0]) errors.push(`${FIELD_NAMES[key] ?? key}: ${messages[0]}`)
      }
    }

    const sku = values.sku.toLowerCase()
    if (sku && taken.has(sku)) errors.push(`SKU ${values.sku} already exists. Edit that product instead.`)
    else if (sku && seen.has(sku)) errors.push(`SKU ${values.sku} appears more than once in this file.`)
    if (sku) seen.add(sku)

    return { line: i + 2, values, errors, product: errors.length === 0 && parsed.success ? parsed.data : undefined }
  })

  return { ok: true, rows, valid: rows.filter((r) => r.product).length }
}

/**
 * Inserts the valid rows in ONE statement: jsonb_to_recordset turns the
 * JSON array (one parameter) into rows, and a single INSERT … SELECT adds
 * them all. A single statement is always atomic, so either every row goes
 * in or none does (the stock_levels trigger fires for each, inside the
 * same statement). ON CONFLICT DO NOTHING skips a SKU that someone added
 * between the check and the import, instead of failing the whole file.
 */
export async function importProducts(products: ProductInput[]): Promise<{ inserted: number; skipped: number }> {
  if (products.length === 0) return { inserted: 0, skipped: 0 }
  const rows = await sql`
    INSERT INTO products (sku, name, category_id, supplier_id, unit, cost_price_kobo, selling_price_kobo, reorder_level)
    SELECT r.sku, r.name, r.category_id, r.supplier_id, r.unit, r.cost, r.price, r.reorder
    FROM jsonb_to_recordset(${JSON.stringify(
      products.map((p) => ({ sku: p.sku, name: p.name, category_id: p.categoryId, supplier_id: p.supplierId, unit: p.unit, cost: p.costPrice, price: p.sellingPrice, reorder: p.reorderLevel })),
    )}::jsonb) AS r(sku text, name text, category_id int, supplier_id int, unit text, cost bigint, price bigint, reorder int)
    ON CONFLICT (sku) DO NOTHING
    RETURNING id`
  return { inserted: rows.length, skipped: products.length - rows.length }
}
