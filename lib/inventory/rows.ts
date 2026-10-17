// ROW SHAPES for the inventory queries (the Day 16/17 pattern: Zod at the
// boundary, so a renamed column fails loudly at the query that caused it).
//
// One driver detail: PostgreSQL bigint (kobo amounts, count(*), sums) can
// exceed JavaScript's safe range, so the Neon driver returns it as a
// STRING. `kobo` and `count` turn it into a number and check that it's a
// safe integer, so precision can never be lost silently.
import 'server-only'

import { z } from 'zod'
import { MOVEMENT_TYPES, UNITS } from './constants'

export { parseRows } from '@/lib/rows'

const numeric = z.union([z.string(), z.number()]).transform(Number)

/** Whole kobo: bigint from the database, checked to be exact. */
export const kobo = numeric.refine(Number.isSafeInteger, 'Amount is not a safe integer')

/** count(*), sum(...): bigint or numeric from the database. */
export const count = numeric.refine(Number.isSafeInteger, 'Count is not a safe integer')

export const CategorySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  archivedAt: z.date().nullable(),
  activeProducts: count,
  archivedProducts: count,
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type Category = z.infer<typeof CategorySchema>

export const SupplierSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  contactPerson: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  notes: z.string().nullable(),
  archivedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type Supplier = z.infer<typeof SupplierSchema>

export const SupplierListRowSchema = SupplierSchema.extend({
  products: count,
  deliveries: count,
  lastDeliveryAt: z.date().nullable(),
})
export type SupplierListRow = z.infer<typeof SupplierListRowSchema>

export const LocationSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  archivedAt: z.date().nullable(),
  createdAt: z.date(),
  units: count,
  productsStocked: count,
  movements: count,
})
export type Location = z.infer<typeof LocationSchema>

/** A short { id, name } pair for <select> options. */
export const OptionSchema = z.object({ id: z.number().int(), name: z.string(), archived: z.boolean() })
export type Option = z.infer<typeof OptionSchema>

/** jsonb_object_agg(location_id, quantity) → { "1": 12, "2": 0 }. */
const byLocation = z.record(z.string(), z.number().int())

export const ProductSchema = z.object({
  id: z.number().int(),
  sku: z.string(),
  name: z.string(),
  categoryId: z.number().int(),
  categoryName: z.string(),
  supplierId: z.number().int().nullable(),
  supplierName: z.string().nullable(),
  unit: z.enum(UNITS),
  costPriceKobo: kobo,
  sellingPriceKobo: kobo,
  reorderLevel: z.number().int(),
  archivedAt: z.date().nullable(),
  version: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
  totalQuantity: count,
  byLocation,
})
export type Product = z.infer<typeof ProductSchema>

export const ProductListRowSchema = ProductSchema.extend({
  /** The quantity the status is measured on: the total, or one location's when filtered. */
  measured: count,
  status: z.enum(['in', 'low', 'out']),
})
export type ProductListRow = z.infer<typeof ProductListRowSchema>

export const MovementSchema = z.object({
  id: z.string(),
  productId: z.number().int(),
  productName: z.string(),
  productSku: z.string(),
  productUnit: z.enum(UNITS),
  productArchived: z.boolean(),
  locationId: z.number().int(),
  locationName: z.string(),
  type: z.enum(MOVEMENT_TYPES),
  quantityChange: z.number().int(),
  quantityAfter: z.number().int(),
  unitCostKobo: kobo.nullable(),
  supplierId: z.number().int().nullable(),
  supplierName: z.string().nullable(),
  reference: z.string().nullable(),
  note: z.string().nullable(),
  userId: z.uuid(),
  userName: z.string(),
  transferId: z.uuid().nullable(),
  createdAt: z.date(),
})
export type Movement = z.infer<typeof MovementSchema>
