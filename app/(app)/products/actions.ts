// PRODUCT SERVER ACTIONS (admin only). Each checks the role itself.
'use server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { fieldError, formValues, plural, readArchived, readId, succeeded } from '@/lib/action-helpers'
import { requireRole } from '@/lib/auth/dal'
import { PRODUCT_FIELDS, productFormValues, type ProductField } from '@/lib/inventory/form-values'
import { createProduct, deleteProduct, setProductArchived, updateProduct } from '@/lib/inventory/products'
import { productSchema, productUpdateSchema } from '@/lib/inventory/validation'
import { failed, invalid, type FormState } from '@/lib/validation'

const FIELDS = PRODUCT_FIELDS

/**
 * The form's state, plus what someone else saved when a VERSION CONFLICT
 * happened: their values (as the form would show them), their names for
 * category and supplier, and their version number. The form then shows a
 * "your value / their value" table and takes their version, so saving
 * again overwrites knowingly.
 */
export type ProductFormState = FormState<ProductField> & {
  conflict?: { version: number; theirs: Record<ProductField, string>; labels: { category: string; supplier: string | null } }
}

const DUPLICATE_SKU = (sku: string) => `Another product already uses the SKU ${sku} (capitals don’t matter).`
const BAD_REFERENCE = 'The chosen category or supplier was just deleted. Pick another.'

export async function createProductAction(_previous: ProductFormState, formData: FormData): Promise<ProductFormState> {
  await requireRole('admin')
  const values = formValues(formData, FIELDS)
  const parsed = productSchema.safeParse(values)
  if (!parsed.success) return invalid(parsed.error, values)

  const result = await createProduct(parsed.data)
  if (!result.ok) {
    if (result.reason === 'duplicate-sku') return fieldError('sku', DUPLICATE_SKU(parsed.data.sku), values)
    return failed(BAD_REFERENCE, values)
  }
  redirect(`/products/${result.id}?notice=created`)
}

export async function updateProductAction(_previous: ProductFormState, formData: FormData): Promise<ProductFormState> {
  await requireRole('admin')
  const values = formValues(formData, FIELDS)
  const parsed = productUpdateSchema.safeParse({ ...values, id: formData.get('id'), version: formData.get('version') })
  if (!parsed.success) return invalid(parsed.error, values)

  const result = await updateProduct(parsed.data)
  if (result.ok) redirect(`/products/${parsed.data.id}?notice=saved`)
  switch (result.reason) {
    case 'conflict':
      return {
        status: 'error',
        message: 'Someone else saved this product while you were editing. Nothing was overwritten. Compare the values below, then save again to keep yours.',
        values,
        submissionId: Date.now(),
        conflict: {
          version: result.current.version,
          theirs: productFormValues(result.current),
          labels: { category: result.current.categoryName, supplier: result.current.supplierName },
        },
      }
    case 'duplicate-sku':
      return fieldError('sku', DUPLICATE_SKU(parsed.data.sku), values)
    case 'bad-reference':
      return failed(BAD_REFERENCE, values)
    default:
      return failed('This product no longer exists.', values)
  }
}

export async function setProductArchivedAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole('admin')
  const id = readId(formData)
  if (!id) return failed('That request wasn’t valid.')
  const archived = readArchived(formData)
  if (!(await setProductArchived(id, archived))) return failed('That product no longer exists.')
  refresh()
  return succeeded(archived ? 'Archived. Hidden from lists and forms; its history stays.' : 'Restored. It’s back in lists and forms.')
}

/** A real delete for a product with no history; otherwise the database refuses and we offer to archive. */
export async function deleteProductAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole('admin')
  const id = readId(formData)
  if (!id) return failed('That request wasn’t valid.')

  const result = await deleteProduct(id)
  if (result.ok) redirect('/products?notice=deleted')
  if (result.reason === 'missing') return failed('That product was already deleted.')
  return {
    status: 'error',
    message: `It can’t be deleted: it has ${plural(result.movements, 'stock movement')} in the ledger, and history must stay complete. Archive it instead: it disappears from lists and forms but its history is kept, and you can restore it later.`,
    offerArchive: true,
    submissionId: Date.now(),
  }
}
