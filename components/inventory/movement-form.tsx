'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { recordMovementAction, type MovementField } from '@/app/(app)/movements/actions'
import { ErrorSummary } from '@/components/forms/error-summary'
import { describedBy, FieldError, fieldIds, NairaField, SelectField, TextAreaField, TextField } from '@/components/forms/field'
import { SubmitButton } from '@/components/forms/submit-button'
import { Icon, type IconName } from '@/components/ui/icon'
import { cn } from '@/lib/cn'
import { FORM_TYPE_LABELS, FORM_TYPES, quantityLabel, type FormMovementType, type Unit } from '@/lib/inventory/constants'
import { LIMITS } from '@/lib/inventory/validation'
import { koboToInput } from '@/lib/money'
import type { FormState } from '@/lib/validation'

export type ProductChoice = {
  id: number
  name: string
  sku: string
  category: string
  unit: Unit
  costKobo: number
  supplierId: number | null
  byLocation: Record<string, number>
}
type Choice = { id: number; name: string }

const TYPE_ICONS: Record<FormMovementType, IconName> = { sale: 'receipt', receive: 'download', damage: 'alert', return: 'restore', transfer: 'transfer', adjustment: 'edit' }
const SUBMIT_LABELS: Record<FormMovementType, string> = {
  sale: 'Record sale',
  receive: 'Record receipt',
  damage: 'Record damage',
  return: 'Record return',
  transfer: 'Move stock',
  adjustment: 'Save count',
}
const LABELS: Record<MovementField, string> = {
  type: 'What happened',
  productId: 'Product',
  locationId: 'Location',
  fromLocationId: 'From',
  toLocationId: 'To',
  quantity: 'Quantity',
  countedQuantity: 'Counted quantity',
  unitCost: 'Cost per unit',
  supplierId: 'Supplier',
  reference: 'Reference',
  note: 'Note',
}

/**
 * A whole number with big − and + buttons either side: one thumb, no
 * keyboard needed for "sold 2". The input still accepts typing (numeric
 * keypad on phones). Remounted with a new `key` after each success, which
 * clears it for the next entry.
 */
function QuantityStepper({ name, label, errors, initial, hint, min }: { name: MovementField; label: string; errors?: string[]; initial: string; hint?: string; min: number }) {
  const [value, setValue] = useState(initial)
  const ids = fieldIds(name)
  const step = (delta: number) => setValue((v) => String(Math.max(min, (Number.parseInt(v, 10) || 0) + delta)))
  const invalid = Boolean(errors?.length)
  return (
    <div>
      <label htmlFor={ids.input} className="mb-1.5 block font-semibold">
        {label}
      </label>
      {hint ? (
        <p id={ids.hint} className="-mt-1 mb-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
      <div className="flex items-stretch gap-2">
        <button type="button" onClick={() => step(-1)} className="grid min-h-14 w-14 shrink-0 place-items-center rounded-control border border-line-strong bg-raised hover:bg-canary" aria-label={`One less (${label.toLowerCase()})`}>
          <Icon name="minus" className="size-6" />
        </button>
        <input
          id={ids.input}
          name={name}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ''))}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy(name, Boolean(hint), invalid)}
          className="field block min-h-14 w-full min-w-0 px-3 text-center text-2xl font-bold tabular-nums"
        />
        <button type="button" onClick={() => step(1)} className="grid min-h-14 w-14 shrink-0 place-items-center rounded-control border border-line-strong bg-raised hover:bg-canary" aria-label={`One more (${label.toLowerCase()})`}>
          <Icon name="plus" className="size-6" />
        </button>
      </div>
      <FieldError name={name} errors={errors} />
    </div>
  )
}

export function MovementForm({
  products,
  locations,
  suppliers,
  isAdmin,
  initialType,
  initialProductId,
}: {
  products: ProductChoice[]
  locations: Choice[]
  suppliers: Choice[]
  isAdmin: boolean
  initialType: FormMovementType
  initialProductId: string
}) {
  const [state, action] = useActionState(recordMovementAction, { status: 'idle' } satisfies FormState<MovementField>)
  const types = FORM_TYPES.filter((t) => t !== 'adjustment' || isAdmin)

  // Receipts usually go into the store room (the last location), everything
  // else happens on the shop floor (the first).
  const defaultLocation = (t: FormMovementType) => String((t === 'receive' ? locations.at(-1) : locations[0])?.id ?? '')
  const [type, setType] = useState<FormMovementType>(isAdmin || initialType !== 'adjustment' ? initialType : 'sale')
  const [productId, setProductId] = useState(initialProductId)
  const [locationId, setLocationId] = useState(defaultLocation(initialType))
  const [fromId, setFromId] = useState(String(locations.at(-1)?.id ?? ''))
  const [toId, setToId] = useState(String(locations[0]?.id ?? ''))
  const product = products.find((p) => String(p.id) === productId)
  const [unitCost, setUnitCost] = useState(product ? koboToInput(product.costKobo) : '')
  const [supplierId, setSupplierId] = useState(product?.supplierId ? String(product.supplierId) : '')

  function chooseType(next: FormMovementType) {
    setType(next)
    setLocationId(defaultLocation(next))
  }
  function chooseProduct(id: string) {
    setProductId(id)
    const p = products.find((x) => String(x.id) === id)
    // A receipt starts from today's cost price and the usual supplier.
    setUnitCost(p ? koboToInput(p.costKobo) : '')
    setSupplierId(p?.supplierId ? String(p.supplierId) : '')
  }

  const errors = (name: MovementField) => state.fieldErrors?.[name]
  const kept = (name: MovementField) => (state.status === 'error' ? state.values?.[name] : undefined) ?? ''
  const stockAt = (id: string) => (product ? (product.byLocation[id] ?? 0) : null)
  // Products grouped by category for <optgroup>s (by hand: Object.groupBy is too new for some phones).
  const byCategory: Record<string, ProductChoice[]> = {}
  for (const p of products) (byCategory[p.category] ??= []).push(p)
  // A new key after each success remounts the quantity inputs (clearing them).
  const entryKey = state.status === 'success' ? state.submissionId : 'entry'

  return (
    <form action={action} noValidate className="space-y-6">
      <ErrorSummary state={state} labels={LABELS} />
      {/* The result of the last entry, announced to screen readers. */}
      <div role="status" aria-live="polite">
        {state.status === 'success' ? (
          <div className="flex items-start gap-2.5 rounded-control border-l-4 border-success bg-success-soft p-3.5 motion-safe:animate-toast">
            <Icon name="checkCircle" className="mt-0.5 text-success" />
            <p className="flex-1 font-semibold">
              {state.message}{' '}
              {product ? (
                <Link href={`/products/${product.id}`} className="font-normal whitespace-nowrap underline">
                  View product
                </Link>
              ) : null}
            </p>
          </div>
        ) : null}
      </div>

      <fieldset>
        <legend className="mb-2 font-semibold">{LABELS.type}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {types.map((t) => (
            <label key={t} className="relative">
              <input type="radio" name="type" value={t} checked={type === t} onChange={() => chooseType(t)} className="peer sr-only" />
              <span
                className={cn(
                  'flex min-h-16 cursor-pointer flex-col justify-center rounded-control border px-3 py-2 transition-colors',
                  'peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
                  type === t ? 'border-2 border-carbon bg-canary' : 'border-line-strong bg-raised hover:bg-canary/60',
                )}
              >
                <span className="flex items-center gap-1.5 font-bold">
                  <Icon name={TYPE_ICONS[t]} className="size-4" />
                  {FORM_TYPE_LABELS[t].label}
                </span>
                <span className="text-xs text-muted">{FORM_TYPE_LABELS[t].hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <SelectField
        name="productId"
        label={LABELS.productId}
        value={productId}
        onChange={(e) => chooseProduct(e.target.value)}
        errors={errors('productId')}
        hint={product ? `${product.sku} · counted in ${product.unit === 'kg' ? 'kg' : `${product.unit}s`}` : undefined}
      >
        <option value="">Choose a product…</option>
        {Object.entries(byCategory).map(([category, items]) => (
          <optgroup key={category} label={category}>
            {items.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </optgroup>
        ))}
      </SelectField>

      {product ? (
        <p className="-mt-3 flex flex-wrap gap-2 text-sm" aria-label="Current stock">
          {locations.map((l) => (
            <span key={l.id} className="rounded-control bg-sunken px-2 py-1 tabular-nums">
              {l.name}: <strong>{stockAt(String(l.id))}</strong>
            </span>
          ))}
        </p>
      ) : null}

      {type === 'transfer' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField name="fromLocationId" label={LABELS.fromLocationId} value={fromId} onChange={(e) => setFromId(e.target.value)} errors={errors('fromLocationId')}>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
                {product ? ` (${stockAt(String(l.id))})` : ''}
              </option>
            ))}
          </SelectField>
          <SelectField name="toLocationId" label={LABELS.toLocationId} value={toId} onChange={(e) => setToId(e.target.value)} errors={errors('toLocationId')}>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </SelectField>
        </div>
      ) : (
        <SelectField name="locationId" label={LABELS.locationId} value={locationId} onChange={(e) => setLocationId(e.target.value)} errors={errors('locationId')}>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
              {product ? ` (${stockAt(String(l.id))} in stock)` : ''}
            </option>
          ))}
        </SelectField>
      )}

      {type === 'adjustment' ? (
        <QuantityStepper
          key={`counted-${entryKey}`}
          name="countedQuantity"
          label={LABELS.countedQuantity}
          min={0}
          initial={kept('countedQuantity')}
          hint={product ? `What you counted on the shelf. Recorded now: ${quantityLabel(stockAt(locationId) ?? 0, product.unit)}. The difference is saved as an adjustment.` : 'What you counted on the shelf.'}
          errors={errors('countedQuantity')}
        />
      ) : (
        <QuantityStepper key={`quantity-${entryKey}`} name="quantity" label={LABELS.quantity} min={1} initial={kept('quantity')} errors={errors('quantity')} />
      )}

      {type === 'receive' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <NairaField name="unitCost" label={LABELS.unitCost} value={unitCost} onChange={(e) => setUnitCost(e.target.value)} hint="From the invoice" errors={errors('unitCost')} />
          <SelectField name="supplierId" label={LABELS.supplierId} value={supplierId} onChange={(e) => setSupplierId(e.target.value)} errors={errors('supplierId')}>
            <option value="">None (market purchase)</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
          <TextField key={`ref-${entryKey}`} name="reference" label={LABELS.reference} hint="Invoice or waybill number" maxLength={LIMITS.reference} autoComplete="off" defaultValue={kept('reference')} errors={errors('reference')} />
        </div>
      ) : type !== 'transfer' && type !== 'adjustment' ? (
        <TextField key={`ref-${entryKey}`} name="reference" label={`${LABELS.reference} (optional)`} hint={type === 'sale' || type === 'return' ? 'Receipt number, if there is one' : undefined} maxLength={LIMITS.reference} autoComplete="off" defaultValue={kept('reference')} errors={errors('reference')} />
      ) : null}

      <TextAreaField
        key={`note-${entryKey}`}
        name="note"
        label={type === 'adjustment' ? 'Reason (required)' : `${LABELS.note} (optional)`}
        hint={type === 'adjustment' ? 'Why the count is different, e.g. “2 packs missing at the weekly count”' : type === 'damage' ? 'e.g. “expired”, “bottle cracked”' : undefined}
        rows={2}
        maxLength={LIMITS.movementNote}
        defaultValue={kept('note')}
        errors={errors('note')}
      />

      <SubmitButton variant="large" pendingLabel="Saving…" className="w-full sm:w-auto">
        <Icon name={TYPE_ICONS[type]} />
        {SUBMIT_LABELS[type]}
      </SubmitButton>
    </form>
  )
}
