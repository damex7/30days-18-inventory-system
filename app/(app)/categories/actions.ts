// CATEGORY SERVER ACTIONS (admin only).
//
// Each one starts with requireRole('admin'). Hiding the buttons from staff
// is only tidiness: a Server Action is a POST endpoint anyone signed in can
// call with any values, so the action itself must check.
'use server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { fieldError, formValues, plural, readArchived, readId, succeeded } from '@/lib/action-helpers'
import { requireRole } from '@/lib/auth/dal'
import { createCategory, deleteCategory, renameCategory, setCategoryArchived } from '@/lib/inventory/categories'
import { categorySchema } from '@/lib/inventory/validation'
import { failed, invalid, type FormState } from '@/lib/validation'

export async function createCategoryAction(_previous: FormState<'name'>, formData: FormData): Promise<FormState<'name'>> {
  await requireRole('admin')
  const values = formValues(formData, ['name'] as const)
  const parsed = categorySchema.safeParse(values)
  if (!parsed.success) return invalid(parsed.error, values)

  const result = await createCategory(parsed.data.name)
  if (!result.ok) return fieldError('name', `There’s already a category called “${parsed.data.name}” (capitals don’t matter).`, values)
  refresh()
  // Empty values: the form clears, ready for the next one.
  return succeeded(`Added “${parsed.data.name}”.`)
}

export async function renameCategoryAction(_previous: FormState<'name'>, formData: FormData): Promise<FormState<'name'>> {
  await requireRole('admin')
  const id = readId(formData)
  const values = formValues(formData, ['name'] as const)
  if (!id) return failed('That request wasn’t valid.', values)
  const parsed = categorySchema.safeParse(values)
  if (!parsed.success) return invalid(parsed.error, values)

  const result = await renameCategory(id, parsed.data.name)
  if (!result.ok) {
    if (result.reason === 'missing') return failed('That category no longer exists.', values)
    return fieldError('name', `There’s already a category called “${parsed.data.name}”.`, values)
  }
  redirect('/categories?notice=renamed')
}

export async function setCategoryArchivedAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole('admin')
  const id = readId(formData)
  if (!id) return failed('That request wasn’t valid.')
  const archived = readArchived(formData)
  if (!(await setCategoryArchived(id, archived))) return failed('That category no longer exists.')
  refresh()
  return succeeded(archived ? 'Archived. It’s hidden from product forms.' : 'Restored.')
}

/**
 * Delete is refused by the database while products use the category
 * (ON DELETE RESTRICT); the message says how many, and offers to archive.
 */
export async function deleteCategoryAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole('admin')
  const id = readId(formData)
  if (!id) return failed('That request wasn’t valid.')

  const result = await deleteCategory(id)
  if (result.ok) redirect('/categories?notice=deleted')
  if (result.reason === 'missing') return failed('That category was already deleted.')

  const used = result.products + result.archivedProducts
  const archivedNote = result.archivedProducts ? ` (${result.archivedProducts} of them archived)` : ''
  return {
    status: 'error',
    message: `It can’t be deleted: ${plural(used, 'product')}${archivedNote} ${used === 1 ? 'uses' : 'use'} it. Move them to another category first, or archive the category to hide it from forms.`,
    offerArchive: true,
    submissionId: Date.now(),
  }
}
