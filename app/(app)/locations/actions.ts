// LOCATION SERVER ACTIONS (admin only). Each checks the role itself.
'use server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { fieldError, formValues, plural, readArchived, readId, succeeded } from '@/lib/action-helpers'
import { requireRole } from '@/lib/auth/dal'
import { createLocation, deleteLocation, renameLocation, setLocationArchived } from '@/lib/inventory/locations'
import { locationSchema } from '@/lib/inventory/validation'
import { failed, invalid, type FormState } from '@/lib/validation'

export async function createLocationAction(_previous: FormState<'name'>, formData: FormData): Promise<FormState<'name'>> {
  await requireRole('admin')
  const values = formValues(formData, ['name'] as const)
  const parsed = locationSchema.safeParse(values)
  if (!parsed.success) return invalid(parsed.error, values)

  const result = await createLocation(parsed.data.name)
  if (!result.ok) return fieldError('name', `There’s already a location called “${parsed.data.name}”.`, values)
  refresh()
  return succeeded(`Added “${parsed.data.name}”. Every product now has a stock line there, starting at 0.`)
}

export async function renameLocationAction(_previous: FormState<'name'>, formData: FormData): Promise<FormState<'name'>> {
  await requireRole('admin')
  const id = readId(formData)
  const values = formValues(formData, ['name'] as const)
  if (!id) return failed('That request wasn’t valid.', values)
  const parsed = locationSchema.safeParse(values)
  if (!parsed.success) return invalid(parsed.error, values)

  const result = await renameLocation(id, parsed.data.name)
  if (!result.ok) {
    if (result.reason === 'missing') return failed('That location no longer exists.', values)
    return fieldError('name', `There’s already a location called “${parsed.data.name}”.`, values)
  }
  redirect('/locations?notice=renamed')
}

export async function setLocationArchivedAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole('admin')
  const id = readId(formData)
  if (!id) return failed('That request wasn’t valid.')
  const archived = readArchived(formData)

  const result = await setLocationArchived(id, archived)
  if (!result.ok) {
    if (result.reason === 'has-stock') return failed(`It still holds ${plural(result.units, 'unit')} of stock. Transfer them to another location first, so nothing disappears from the lists.`)
    if (result.reason === 'last-location') return failed('This is the only active location. Stock needs somewhere to be.')
    return failed('That location no longer exists.')
  }
  refresh()
  return succeeded(archived ? 'Archived. It’s hidden from movement forms.' : 'Restored.')
}

export async function deleteLocationAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireRole('admin')
  const id = readId(formData)
  if (!id) return failed('That request wasn’t valid.')

  const result = await deleteLocation(id)
  if (result.ok) redirect('/locations?notice=deleted')
  if (result.reason === 'missing') return failed('That location was already deleted.')
  return {
    status: 'error',
    message: `It can’t be deleted: ${plural(result.movements, 'stock movement')} happened here, and the ledger has to keep them. Archive it instead to hide it from forms.`,
    offerArchive: true,
    submissionId: Date.now(),
  }
}
