// RECORDING STOCK MOVEMENTS: one Server Action for every type.
//
// Staff may record receipts, sales, damage, returns and transfers.
// Adjustments (setting a counted quantity) are admin only. The form hides
// that option from staff, but the check that matters is here: anyone signed
// in can POST to this action with any `type`.
'use server'

import { refresh } from 'next/cache'
import { fieldError, formValues } from '@/lib/action-helpers'
import { requireRole, verifySession } from '@/lib/auth/dal'
import { ADMIN_ONLY_TYPES, quantityLabel } from '@/lib/inventory/constants'
import { recordMovement, type StockResult } from '@/lib/inventory/stock'
import { formTypeSchema, movementSchema } from '@/lib/inventory/validation'
import { failed, invalid, type FormState } from '@/lib/validation'

const FIELDS = ['type', 'productId', 'locationId', 'fromLocationId', 'toLocationId', 'quantity', 'countedQuantity', 'unitCost', 'supplierId', 'reference', 'note'] as const
export type MovementField = (typeof FIELDS)[number]

/** The sentence staff see after a successful movement. */
function successMessage(result: Extract<StockResult, { ok: true }>, type: string): string {
  const [a, b] = result.changes
  if (!a) return 'Recorded.'
  const amount = quantityLabel(Math.abs(a.quantityChange), result.unit)
  switch (type) {
    case 'transfer':
      return `Moved ${amount} of ${result.productName} from ${a.locationName} to ${b?.locationName}. Now ${a.quantityAfter} at ${a.locationName}, ${b?.quantityAfter} at ${b?.locationName}.`
    case 'adjustment':
      return `Adjusted ${result.productName} at ${a.locationName} by ${a.quantityChange > 0 ? '+' : '−'}${Math.abs(a.quantityChange)}. Now ${a.quantityAfter}.`
    case 'receive':
      return `Received ${amount} of ${result.productName}. ${a.quantityAfter} now at ${a.locationName}.`
    case 'sale':
      return `Sold ${amount} of ${result.productName}. ${a.quantityAfter} left at ${a.locationName}.`
    case 'damage':
      return `Recorded ${amount} of ${result.productName} as damaged. ${a.quantityAfter} left at ${a.locationName}.`
    default:
      return `Returned ${amount} of ${result.productName}. ${a.quantityAfter} now at ${a.locationName}.`
  }
}

export async function recordMovementAction(_previous: FormState<MovementField>, formData: FormData): Promise<FormState<MovementField>> {
  const { user } = await verifySession()
  const values = formValues(formData, FIELDS)

  const type = formTypeSchema.safeParse(values.type)
  if (!type.success) return failed('Choose what kind of movement this is.', values)
  if (ADMIN_ONLY_TYPES.has(type.data)) await requireRole('admin')

  const parsed = movementSchema.safeParse(values)
  if (!parsed.success) return invalid(parsed.error, values)

  const result = await recordMovement(user.id, parsed.data)
  if (result.ok) {
    // Re-render the page around the form, so the stock it shows is fresh.
    refresh()
    // Keep the type, product and location for the next entry; clear the rest.
    return {
      status: 'success',
      message: successMessage(result, parsed.data.type),
      values: { type: values.type, productId: values.productId, locationId: values.locationId, fromLocationId: values.fromLocationId, toLocationId: values.toLocationId, supplierId: values.supplierId },
      submissionId: Date.now(),
    }
  }

  switch (result.reason) {
    case 'insufficient': {
      // The guarded UPDATE matched nothing: not enough stock (perhaps because
      // someone else sold it a moment ago). `available` is the quantity now.
      const message =
        result.available === 0
          ? `None left at ${result.locationName}: it’s out of stock there.`
          : `Only ${quantityLabel(result.available, result.unit)} left at ${result.locationName}.`
      return fieldError('quantity', message, values)
    }
    case 'unchanged':
      return fieldError('countedQuantity', `The count matches the stock already recorded (${result.quantity} at ${result.locationName}). Nothing to adjust.`, values)
    case 'archived':
      return failed('That product or location is archived, so no stock can be recorded for it. Restore it first.', values)
    case 'bad-reference':
      return failed('The product, location or supplier was just deleted. Choose again.', values)
    case 'refused':
      return failed('The database refused this change because stock would go below zero. Nothing was saved.', values)
    default:
      return failed('That product or location no longer exists.', values)
  }
}
