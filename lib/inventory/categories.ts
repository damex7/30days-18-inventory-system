// CATEGORIES: create, read, update, archive, delete.
//
// The rules of this whole data layer (as on Days 16-17):
// - Every value reaches SQL as a PARAMETER (${value} in sql``). Never
//   string concatenation, so SQL injection is impossible.
// - Every row coming back is checked with Zod (./rows.ts).
// - Only server code imports this ('server-only'): pages and Server Actions
//   call these functions; they never write SQL themselves.
import 'server-only'

import { sql } from '@/lib/db'
import { isReferencedError, isUniqueError } from '@/lib/db-errors'
import { CategorySchema, OptionSchema, parseRows, type Category, type Option } from './rows'

const columns = () => sql`
  c.id, c.name::text AS name, c.archived_at AS "archivedAt",
  c.created_at AS "createdAt", c.updated_at AS "updatedAt",
  (SELECT count(*) FROM products p WHERE p.category_id = c.id AND p.archived_at IS NULL) AS "activeProducts",
  (SELECT count(*) FROM products p WHERE p.category_id = c.id AND p.archived_at IS NOT NULL) AS "archivedProducts"`

/** Every category, active first, then by name. The counts use products_category_id_idx. */
export async function listCategories(): Promise<Category[]> {
  const rows = await sql`SELECT ${columns()} FROM categories c ORDER BY c.archived_at IS NOT NULL, c.name`
  return parseRows(CategorySchema, rows, 'listCategories')
}

export async function getCategory(id: number): Promise<Category | null> {
  const rows = await sql`SELECT ${columns()} FROM categories c WHERE c.id = ${id}`
  return parseRows(CategorySchema, rows, 'getCategory')[0] ?? null
}

/**
 * For <select>s: active categories, plus (when editing) the one a product
 * already uses even if it was archived since, so the form can show it.
 */
export async function categoryOptions(keepId: number | null = null): Promise<Option[]> {
  const rows = await sql`
    SELECT id, name::text AS name, archived_at IS NOT NULL AS archived
    FROM categories
    WHERE archived_at IS NULL OR id = ${keepId}
    ORDER BY name`
  return parseRows(OptionSchema, rows, 'categoryOptions')
}

export type SaveResult = { ok: true; id: number } | { ok: false; reason: 'duplicate' | 'missing' }

/**
 * The UNIQUE index (citext, so case-insensitive) decides whether a name is
 * taken, even if two admins add "Snacks" at the same moment. We just
 * translate its error 23505 into a sentence.
 */
export async function createCategory(name: string): Promise<SaveResult> {
  try {
    const rows = await sql`INSERT INTO categories (name) VALUES (${name}) RETURNING id`
    return { ok: true, id: Number(rows[0]?.id) }
  } catch (error) {
    if (isUniqueError(error, 'categories_name_key')) return { ok: false, reason: 'duplicate' }
    throw error
  }
}

export async function renameCategory(id: number, name: string): Promise<SaveResult> {
  try {
    const rows = await sql`UPDATE categories SET name = ${name} WHERE id = ${id} RETURNING id`
    return rows.length ? { ok: true, id } : { ok: false, reason: 'missing' }
  } catch (error) {
    if (isUniqueError(error, 'categories_name_key')) return { ok: false, reason: 'duplicate' }
    throw error
  }
}

/** Archive (hide from forms) or restore. Returns false if the category doesn't exist. */
export async function setCategoryArchived(id: number, archived: boolean): Promise<boolean> {
  const rows = await sql`
    UPDATE categories SET archived_at = CASE WHEN ${archived}::boolean THEN COALESCE(archived_at, now()) ELSE NULL END
    WHERE id = ${id}
    RETURNING id`
  return rows.length > 0
}

export type DeleteResult = { ok: true } | { ok: false; reason: 'missing' } | { ok: false; reason: 'in-use'; products: number; archivedProducts: number }

/**
 * Tries the DELETE and lets the foreign key decide.
 *
 * products.category_id is ON DELETE RESTRICT (db/migrations/008), so while
 * any product (archived ones too) uses this category PostgreSQL refuses.
 * Only THEN do we count the products, to say how many. Checking first and
 * deleting second would leave a gap where a new product could be added
 * between the two; the foreign key has no gap.
 */
export async function deleteCategory(id: number): Promise<DeleteResult> {
  try {
    const rows = await sql`DELETE FROM categories WHERE id = ${id} RETURNING id`
    return rows.length ? { ok: true } : { ok: false, reason: 'missing' }
  } catch (error) {
    if (!isReferencedError(error)) throw error
    const category = await getCategory(id)
    return { ok: false, reason: 'in-use', products: category?.activeProducts ?? 0, archivedProducts: category?.archivedProducts ?? 0 }
  }
}
