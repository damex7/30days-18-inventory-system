import { koboToInput } from '@/lib/money'
import type { Product } from './rows'

export const PRODUCT_FIELDS = ['sku', 'name', 'categoryId', 'supplierId', 'unit', 'costPrice', 'sellingPrice', 'reorderLevel'] as const
export type ProductField = (typeof PRODUCT_FIELDS)[number]

/** A saved product as the text values its edit form shows (kobo back to "1250.00"). */
export function productFormValues(p: Product): Record<ProductField, string> {
  return {
    sku: p.sku,
    name: p.name,
    categoryId: String(p.categoryId),
    supplierId: p.supplierId ? String(p.supplierId) : '',
    unit: p.unit,
    costPrice: koboToInput(p.costPriceKobo),
    sellingPrice: koboToInput(p.sellingPriceKobo),
    reorderLevel: String(p.reorderLevel),
  }
}
