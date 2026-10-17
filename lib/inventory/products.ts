// PRODUCTS: create, read (list, search, filter, sort, page), update with
// optimistic concurrency, archive, restore, delete.
// (The rules at the top of ./categories.ts apply here too.)
import 'server-only'

import { sql } from '@/lib/db'
import { isReferencedError, isUniqueError } from '@/lib/db-errors'
import { parseRows, ProductListRowSchema, ProductSchema, type Product, type ProductListRow } from './rows'
import type { ProductInput, ProductListParams, ProductUpdateInput } from './validation'

export const PRODUCT_PAGE_SIZE = 25
/** The CSV export's ceiling: a whole shop's catalogue, but not an accidental million rows. */
export const EXPORT_LIMIT = 10_000

/** The product's own columns plus its category, supplier and stock. */
const productColumns = () => sql`
  p.id, p.sku::text AS sku, p.name, p.category_id AS "categoryId", c.name::text AS "categoryName",
  p.supplier_id AS "supplierId", s.name::text AS "supplierName", p.unit,
  p.cost_price_kobo AS "costPriceKobo", p.selling_price_kobo AS "sellingPriceKobo",
  p.reorder_level AS "reorderLevel", p.archived_at AS "archivedAt", p.version,
  p.created_at AS "createdAt", p.updated_at AS "updatedAt",
  lv.total AS "totalQuantity", lv.by_location AS "byLocation"`

/**
 * CROSS JOIN LATERAL runs the small subquery once PER PRODUCT ROW: it adds
 * up that product's stock_levels rows (one index probe on the primary key,
 * which starts with product_id) and gathers them into {"1": 12, "2": 0}.
 * Because it runs after the WHERE on products, a search for "milo" only
 * sums stock for the few products that match.
 */
const productFrom = () => sql`
  FROM products p
  JOIN categories c ON c.id = p.category_id
  LEFT JOIN suppliers s ON s.id = p.supplier_id
  CROSS JOIN LATERAL (
    SELECT COALESCE(sum(sl.quantity), 0) AS total,
           COALESCE(jsonb_object_agg(sl.location_id, sl.quantity), '{}'::jsonb) AS by_location
    FROM stock_levels sl
    WHERE sl.product_id = p.id
  ) lv`

/** Escapes LIKE's wildcards, so a search for "50%" means the characters 5, 0 and %. */
function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, '\\$&')}%`
}

/**
 * The SORT WHITELIST. A column name or ASC/DESC can't be sent as a $1
 * parameter (parameters are only ever VALUES), so the URL's ?sort= is
 * matched against this fixed list, and only these hand-written SQL
 * fragments ever reach ORDER BY. Anything else was already turned into
 * "name" by productListSchema. p.id comes last so the order is always
 * the same, even between equal values (stable paging).
 */
function orderBy(sort: ProductListParams['sort'], dir: ProductListParams['dir']) {
  const d = dir === 'desc' ? sql`DESC` : sql`ASC`
  if (sort.startsWith('loc-')) {
    const locationId = sort.slice(4)
    return sql`COALESCE((lv.by_location ->> ${locationId})::int, 0) ${d}, p.name, p.id`
  }
  switch (sort) {
    case 'sku':
      return sql`p.sku ${d}, p.id`
    case 'category':
      return sql`c.name ${d}, p.name, p.id`
    case 'supplier':
      return sql`s.name ${d} NULLS LAST, p.name, p.id`
    case 'stock':
      return sql`m.measured ${d}, p.name, p.id`
    case 'cost':
      return sql`p.cost_price_kobo ${d}, p.name, p.id`
    case 'price':
      return sql`p.selling_price_kobo ${d}, p.name, p.id`
    case 'reorder':
      return sql`p.reorder_level ${d}, p.name, p.id`
    case 'status':
      // Out first, then low, then in stock (ascending = most urgent first).
      return sql`(CASE WHEN m.measured <= 0 THEN 0 WHEN m.measured <= p.reorder_level THEN 1 ELSE 2 END) ${d}, p.name, p.id`
    default:
      return sql`p.name ${d}, p.id`
  }
}

/**
 * The filtered, sorted products query, shared by the page and the CSV
 * export. Everything comes from the URL (productListSchema), and every
 * value is a parameter.
 *
 * `measured` is the quantity the status and the "stock" sort look at: the
 * total, or with ?location= that location's quantity. So "Shop floor +
 * Out" lists what has run out on the floor (maybe still in the store room).
 */
function productQuery(params: ProductListParams, page: { limit: number; offset: number }) {
  const location = params.location ? String(params.location) : null
  const measured = location ? sql`COALESCE((lv.by_location ->> ${location})::int, 0)` : sql`lv.total`

  const status =
    params.status === 'out'
      ? sql`AND m.measured <= 0`
      : params.status === 'low'
        ? sql`AND m.measured > 0 AND m.measured <= p.reorder_level`
        : params.status === 'in'
          ? sql`AND m.measured > p.reorder_level`
          : sql``

  return sql`
    SELECT ${productColumns()},
           m.measured,
           CASE WHEN m.measured <= 0 THEN 'out' WHEN m.measured <= p.reorder_level THEN 'low' ELSE 'in' END AS status,
           count(*) OVER () AS "totalRows"
    ${productFrom()}
    CROSS JOIN LATERAL (SELECT ${measured} AS measured) m
    WHERE ${params.status === 'archived' ? sql`p.archived_at IS NOT NULL` : sql`p.archived_at IS NULL`}
      ${params.q ? sql`AND (p.name ILIKE ${containsPattern(params.q)} OR p.sku::text ILIKE ${containsPattern(params.q)})` : sql``}
      ${params.category ? sql`AND p.category_id = ${params.category}` : sql``}
      ${params.supplier ? sql`AND p.supplier_id = ${params.supplier}` : sql``}
      ${status}
    ORDER BY ${orderBy(params.sort, params.dir)}
    LIMIT ${page.limit} OFFSET ${page.offset}`
}

/**
 * One page of products. count(*) OVER () is a WINDOW FUNCTION: it counts
 * every matching row before LIMIT applies, so the page and the total come
 * back from ONE query.
 */
export async function listProducts(params: ProductListParams): Promise<{ products: ProductListRow[]; total: number }> {
  const rows = await productQuery(params, { limit: PRODUCT_PAGE_SIZE, offset: (params.page - 1) * PRODUCT_PAGE_SIZE })
  return { products: parseRows(ProductListRowSchema, rows, 'listProducts'), total: Number(rows[0]?.totalRows ?? 0) }
}

/** Every product matching the filters (no paging), for the CSV export. */
export async function listProductsForExport(params: ProductListParams): Promise<ProductListRow[]> {
  const rows = await productQuery(params, { limit: EXPORT_LIMIT, offset: 0 })
  return parseRows(ProductListRowSchema, rows, 'listProductsForExport')
}

export async function getProduct(id: number): Promise<Product | null> {
  const rows = await sql`SELECT ${productColumns()} ${productFrom()} WHERE p.id = ${id}`
  return parseRows(ProductSchema, rows, 'getProduct')[0] ?? null
}

/** Active products for the movement form's <select>, grouped by category. */
export async function productChoices(): Promise<Product[]> {
  const rows = await sql`SELECT ${productColumns()} ${productFrom()} WHERE p.archived_at IS NULL ORDER BY c.name, p.name`
  return parseRows(ProductSchema, rows, 'productChoices')
}

/** How many ledger rows a product has (shown on its page; 0 means it can be deleted). */
export async function countProductMovements(id: number): Promise<number> {
  const rows = await sql`SELECT count(*) AS n FROM stock_movements WHERE product_id = ${id}`
  return Number(rows[0]?.n ?? 0)
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export type CreateResult = { ok: true; id: number } | { ok: false; reason: 'duplicate-sku' | 'bad-reference' }

/**
 * A new product. The trigger from db/migrations/009 creates its stock row
 * at every location (quantity 0) in the same statement. Stock itself only
 * ever arrives through a movement (a receipt), so the ledger explains every
 * unit from day one.
 */
export async function createProduct(input: ProductInput): Promise<CreateResult> {
  try {
    const rows = await sql`
      INSERT INTO products (sku, name, category_id, supplier_id, unit, cost_price_kobo, selling_price_kobo, reorder_level)
      VALUES (${input.sku}, ${input.name}, ${input.categoryId}, ${input.supplierId}, ${input.unit},
              ${input.costPrice}, ${input.sellingPrice}, ${input.reorderLevel})
      RETURNING id`
    return { ok: true, id: Number(rows[0]?.id) }
  } catch (error) {
    if (isUniqueError(error, 'products_sku_key')) return { ok: false, reason: 'duplicate-sku' }
    // 23503 on INSERT: the chosen category or supplier was deleted meanwhile.
    if (isReferencedError(error)) return { ok: false, reason: 'bad-reference' }
    throw error
  }
}

export type UpdateResult =
  | { ok: true; version: number }
  | { ok: false; reason: 'conflict'; current: Product }
  | { ok: false; reason: 'missing' | 'duplicate-sku' | 'bad-reference' }

/**
 * OPTIMISTIC CONCURRENCY (Day 16's idea). The form sends back the version
 * it was loaded with. The UPDATE only matches the row if it is STILL that
 * version, and adds 1 to it. If someone else saved in between, the WHERE
 * matches nothing, nothing is overwritten, and we return THEIR saved values
 * so the form can show what changed.
 *
 * Two saves at the same moment can't both win: the first locks the row;
 * the second waits, then re-checks `version = $n` against the row the first
 * one committed, finds n+1, and matches nothing.
 */
export async function updateProduct(input: ProductUpdateInput): Promise<UpdateResult> {
  let rows
  try {
    rows = await sql`
      UPDATE products SET
        sku = ${input.sku}, name = ${input.name}, category_id = ${input.categoryId}, supplier_id = ${input.supplierId},
        unit = ${input.unit}, cost_price_kobo = ${input.costPrice}, selling_price_kobo = ${input.sellingPrice},
        reorder_level = ${input.reorderLevel}, version = version + 1
      WHERE id = ${input.id} AND version = ${input.version}
      RETURNING version`
  } catch (error) {
    if (isUniqueError(error, 'products_sku_key')) return { ok: false, reason: 'duplicate-sku' }
    if (isReferencedError(error)) return { ok: false, reason: 'bad-reference' }
    throw error
  }
  const saved = rows[0]
  if (saved) return { ok: true, version: Number(saved.version) }

  const current = await getProduct(input.id)
  return current ? { ok: false, reason: 'conflict', current } : { ok: false, reason: 'missing' }
}

/**
 * Archive or restore. Doesn't touch `version`: archiving changes no field
 * the edit form shows, so an edit open elsewhere shouldn't conflict with it.
 */
export async function setProductArchived(id: number, archived: boolean): Promise<boolean> {
  const rows = await sql`
    UPDATE products SET archived_at = CASE WHEN ${archived}::boolean THEN COALESCE(archived_at, now()) ELSE NULL END
    WHERE id = ${id}
    RETURNING id`
  return rows.length > 0
}

export type DeleteResult = { ok: true } | { ok: false; reason: 'missing' } | { ok: false; reason: 'has-history'; movements: number }

/**
 * A REAL delete, only possible for a product with no movements at all
 * (one added by mistake). With movements, stock_movements.product_id ON
 * DELETE RESTRICT refuses (error 23001), and the caller offers to archive.
 * Without movements every stock row is 0, and they're removed with it
 * (stock_levels.product_id ON DELETE CASCADE).
 */
export async function deleteProduct(id: number): Promise<DeleteResult> {
  try {
    const rows = await sql`DELETE FROM products WHERE id = ${id} RETURNING id`
    return rows.length ? { ok: true } : { ok: false, reason: 'missing' }
  } catch (error) {
    if (!isReferencedError(error)) throw error
    return { ok: false, reason: 'has-history', movements: await countProductMovements(id) }
  }
}
