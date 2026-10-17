// INPUT RULES for the inventory: every form field and every URL parameter
// passes through one of these Zod schemas before it reaches SQL. Types come
// from z.infer, so the rules and the TypeScript types can't drift apart.
//
// Form values always arrive as TEXT (FormData), so each schema starts from
// a string and transforms it: "1,250.50" → 125050 kobo, "12" → 12,
// "" → null. Not server-only: the forms use the same limits.
import { z } from 'zod'
import { parseNaira } from '@/lib/money'
import { normalizeNigerianPhone } from '@/lib/phone'
import { FORM_TYPES, STOCK_STATUSES, UNITS, MOVEMENT_TYPES } from './constants'

export const LIMITS = {
  name: 120,
  categoryName: 60,
  locationName: 60,
  person: 100,
  address: 300,
  notes: 2000,
  reference: 60,
  movementNote: 500,
  maxQuantity: 1_000_000,
} as const

// ---------------------------------------------------------------------------
// Field building blocks
// ---------------------------------------------------------------------------

const requiredText = (max: number, missing: string) =>
  z.string({ error: missing }).trim().min(1, missing).max(max, `Use ${max} characters or fewer`)

/** Optional text: "" (an empty input) becomes null, which is what the database stores. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer`)
    .transform((value) => (value === '' ? null : value))

/** An id chosen in a <select>: digits only. */
const idField = (missing: string) =>
  z
    .string({ error: missing })
    .regex(/^\d{1,9}$/, missing)
    .transform(Number)

/** An optional <select> ("" = none). */
const optionalId = z
  .string()
  .regex(/^(\d{1,9})?$/, 'Choose from the list')
  .transform((value) => (value === '' ? null : Number(value)))

/** Naira typed by a person → integer kobo (lib/money.ts parses it as text, never as a float). */
const naira = (label: string) =>
  z.string({ error: `Enter the ${label}` }).transform((value, ctx) => {
    if (value.trim() === '') {
      ctx.addIssue({ code: 'custom', message: `Enter the ${label}` })
      return z.NEVER
    }
    const kobo = parseNaira(value)
    if (kobo === null) {
      ctx.addIssue({ code: 'custom', message: `Enter the ${label} in Naira, like 1250 or 1,250.50` })
      return z.NEVER
    }
    return kobo
  })

const wholeNumber = (label: string, min: number, max: number) =>
  z
    .string({ error: `Enter the ${label}` })
    .trim()
    .min(1, `Enter the ${label}`)
    .regex(/^\d+$/, `Enter the ${label} as a whole number`)
    .transform(Number)
    .refine((n) => n >= min && n <= max, `Enter a number from ${min.toLocaleString('en-NG')} to ${max.toLocaleString('en-NG')}`)

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export const categorySchema = z.object({ name: requiredText(LIMITS.categoryName, 'Enter a category name') })
export type CategoryInput = z.infer<typeof categorySchema>

export const locationSchema = z.object({ name: requiredText(LIMITS.locationName, 'Enter a location name') })
export type LocationInput = z.infer<typeof locationSchema>

export const supplierSchema = z.object({
  name: requiredText(LIMITS.name, 'Enter the supplier’s name'),
  contactPerson: optionalText(LIMITS.person),
  // Any common way of writing a Nigerian mobile, stored as +234… (lib/phone.ts).
  phone: z
    .string()
    .trim()
    .transform((value, ctx) => {
      if (value === '') return null
      const e164 = normalizeNigerianPhone(value)
      if (!e164) {
        ctx.addIssue({ code: 'custom', message: 'Enter a Nigerian mobile number, like 0803 123 4567 or +234 803 123 4567' })
        return z.NEVER
      }
      return e164
    }),
  email: z
    .string()
    .trim()
    .max(254, 'That email address is too long')
    .pipe(z.union([z.literal(''), z.email('Enter an email address like orders@example.com')]))
    .transform((value) => (value === '' ? null : value)),
  address: optionalText(LIMITS.address),
  notes: optionalText(LIMITS.notes),
})
export type SupplierInput = z.infer<typeof supplierSchema>

export const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,31}$/

export const productSchema = z.object({
  // Stored in capitals so labels look the same; the column is citext anyway.
  sku: z
    .string({ error: 'Enter a SKU' })
    .trim()
    .min(1, 'Enter a SKU')
    .regex(SKU_PATTERN, 'Use 2 to 32 letters, digits, dots, dashes or underscores, starting with a letter or digit')
    .transform((sku) => sku.toUpperCase()),
  name: requiredText(LIMITS.name, 'Enter the product name'),
  categoryId: idField('Choose a category'),
  supplierId: optionalId,
  unit: z.enum(UNITS, { error: 'Choose how it’s counted' }),
  costPrice: naira('cost price'),
  sellingPrice: naira('selling price'),
  reorderLevel: wholeNumber('reorder level', 0, LIMITS.maxQuantity),
})
export type ProductInput = z.infer<typeof productSchema>

/** Editing also sends the id and the VERSION the form was loaded with (optimistic concurrency). */
export const productUpdateSchema = productSchema.extend({
  id: idField('Missing product'),
  version: wholeNumber('version', 1, 2_000_000_000),
})
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>

export const idSchema = z.object({ id: idField('Missing id') })

// ---------------------------------------------------------------------------
// Stock movements: one schema per form type, chosen by `type`
// ---------------------------------------------------------------------------

const quantity = wholeNumber('quantity', 1, LIMITS.maxQuantity)
const productId = idField('Choose a product')
const locationId = idField('Choose a location')
const reference = optionalText(LIMITS.reference)
const note = optionalText(LIMITS.movementNote)

/**
 * A DISCRIMINATED UNION: `type` decides which other fields are required.
 * A receipt needs a unit cost; a transfer needs two different locations;
 * an adjustment needs the counted quantity and a reason.
 */
export const movementSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('receive'), productId, locationId, quantity, unitCost: naira('unit cost'), supplierId: optionalId, reference, note }),
  z.object({ type: z.literal('sale'), productId, locationId, quantity, reference, note }),
  z.object({ type: z.literal('damage'), productId, locationId, quantity, reference, note }),
  z.object({ type: z.literal('return'), productId, locationId, quantity, reference, note }),
  z
    .object({ type: z.literal('transfer'), productId, fromLocationId: idField('Choose where it’s moving from'), toLocationId: idField('Choose where it’s going'), quantity, note })
    .refine((t) => t.fromLocationId !== t.toLocationId, { message: 'Choose two different locations', path: ['toLocationId'] }),
  z.object({
    type: z.literal('adjustment'),
    productId,
    locationId,
    countedQuantity: wholeNumber('counted quantity', 0, LIMITS.maxQuantity),
    note: z
      .string({ error: 'Say why the count is different' })
      .trim()
      .min(3, 'Say why the count is different (at least 3 characters)')
      .max(LIMITS.movementNote, `Use ${LIMITS.movementNote} characters or fewer`),
  }),
])
export type MovementInput = z.infer<typeof movementSchema>
export const formTypeSchema = z.enum(FORM_TYPES)

// ---------------------------------------------------------------------------
// URL parameters (searchParams). Bad values fall back to defaults with
// .catch() instead of erroring, so a mangled bookmark still opens a page.
// ---------------------------------------------------------------------------

/** searchParams values can be string, string[] or undefined: take the first. */
const param = <T extends z.ZodType>(schema: T) => z.preprocess((value) => (Array.isArray(value) ? value[0] : value), schema)

const optionalIdParam = param(z.string().regex(/^\d{1,9}$/).transform(Number).optional()).catch(undefined)
const pageParam = param(z.coerce.number().int().min(1).max(100_000)).catch(1)

/** Sort keys the products table understands; per-location stock is "loc-<id>". */
export const PRODUCT_SORTS = ['name', 'sku', 'category', 'supplier', 'stock', 'cost', 'price', 'reorder', 'status'] as const
export type ProductSort = (typeof PRODUCT_SORTS)[number] | `loc-${number}`

export const productListSchema = z.object({
  q: param(z.string().trim().max(100)).catch(''),
  category: optionalIdParam,
  supplier: optionalIdParam,
  location: optionalIdParam,
  status: param(z.enum([...STOCK_STATUSES, 'archived', 'all'])).catch('all'),
  sort: param(
    z.union([z.enum(PRODUCT_SORTS), z.string().regex(/^loc-\d{1,9}$/) as z.ZodType<`loc-${number}`>]),
  ).catch('name'),
  dir: param(z.enum(['asc', 'desc'])).catch('asc'),
  page: pageParam,
})
export type ProductListParams = z.infer<typeof productListSchema>

const dateParam = param(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !Number.isNaN(Date.parse(d))).optional()).catch(undefined)

export const movementListSchema = z.object({
  type: param(z.enum(MOVEMENT_TYPES).optional()).catch(undefined),
  product: optionalIdParam,
  location: optionalIdParam,
  user: param(z.uuid().optional()).catch(undefined),
  from: dateParam,
  to: dateParam,
  page: pageParam,
})
export type MovementListParams = z.infer<typeof movementListSchema>
