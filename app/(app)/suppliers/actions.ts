// SUPPLIER SERVER ACTIONS (admin only). Each checks the role itself.
'use server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { fieldError, formValues, plural, readArchived, readId, succeeded } from '@/lib/action-helpers'
import { requireRole } from '@/lib/auth/dal'
import { createSupplier, deleteSupplier, setSupplierArchived, updateSupplier } from '@/lib/inventory/suppliers'
import { supplierSchema } from '@/lib/inventory/validation'
import { failed, invalid, type FormState } from '@/lib/validation'

const FIELDS = ['name', 'contactPerson', 'phone', 'email', 'address', 'notes'] as const
export type SupplierField = (typeof FIELDS)[number]

/** Creates (no id) or updates (with id) a supplier. */
export async function saveSupplierAction(_previous: FormState<SupplierField>, formData: FormData): Promise<FormState<SupplierField>> {
  await requireRole('admin')
  const values = formValues(formData, FIELDS)
  const parsed = supplierSchema.safeParse(values)
  if (!parsed.success) return invalid(parsed.error, values)

  const id = readId(formData)
  const result = id ? await updateSupplier(id, parsed.data) : await createSupplier(parsed.data)
  if (!result.ok) {
    if (result.reason === 'missing') return failed('That supplier no longer exists.', values)
    return fieldError('name', `There’s already a supplier called “${parsed.data.name}”.`, values)
  }
  redirect(`/suppliers/${result.id}?notice=${id ? 'saved' : 'created'}`)
}

export async function setSupplierArchivedAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole('admin')
  const id = readId(formData)
  if (!id) return failed('That request wasn’t valid.')
  const archived = readArchived(formData)
  if (!(await setSupplierArchived(id, archived))) return failed('That supplier no longer exists.')
  refresh()
  return succeeded(archived ? 'Archived. Hidden from forms; past deliveries still show it.' : 'Restored.')
}

/**
 * A supplier with deliveries can't be deleted (RESTRICT from the ledger).
 * One that only appears as a product's default supplier can: those
 * products' supplier_id is cleared by ON DELETE SET NULL.
 */
export async function deleteSupplierAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole('admin')
  const id = readId(formData)
  if (!id) return failed('That request wasn’t valid.')

  const result = await deleteSupplier(id)
  if (result.ok) redirect('/suppliers?notice=deleted')
  if (result.reason === 'missing') return failed('That supplier was already deleted.')
  return {
    status: 'error',
    message: `It can’t be deleted: ${plural(result.deliveries, 'delivery', 'deliveries')} from this supplier ${result.deliveries === 1 ? 'is' : 'are'} in the ledger, and history has to keep saying who delivered. Archive it instead.`,
    offerArchive: true,
    submissionId: Date.now(),
  }
}
