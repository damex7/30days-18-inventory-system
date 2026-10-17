'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { createProductAction, updateProductAction, type ProductFormState } from '@/app/(app)/products/actions'
import { ErrorSummary } from '@/components/forms/error-summary'
import { NairaField, SelectField, TextField } from '@/components/forms/field'
import { SubmitButton } from '@/components/forms/submit-button'
import { button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { UNITS } from '@/lib/inventory/constants'
import type { ProductField } from '@/lib/inventory/form-values'
import { LIMITS } from '@/lib/inventory/validation'

type Option = { id: number; name: string; archived: boolean }

const LABELS: Record<ProductField, string> = {
  sku: 'SKU',
  name: 'Product name',
  categoryId: 'Category',
  supplierId: 'Usual supplier',
  unit: 'Counted in',
  costPrice: 'Cost price',
  sellingPrice: 'Selling price',
  reorderLevel: 'Reorder level',
}

/**
 * Add or edit a product. Prices are typed in Naira ("1,250.50") and the
 * server stores integer kobo.
 *
 * EDITING sends back the `version` the form was loaded with. If someone
 * else saved first, the action changes nothing and returns their values;
 * this form then shows the differences, keeps what you typed, and takes
 * their version number, so pressing Save again overwrites knowingly.
 */
export function ProductForm({
  product,
  categories,
  suppliers,
}: {
  product?: { id: number; version: number; values: Record<ProductField, string> }
  categories: Option[]
  suppliers: Option[]
}) {
  const [state, action] = useActionState<ProductFormState, FormData>(product ? updateProductAction : createProductAction, { status: 'idle' })
  const value = (name: ProductField) => (state.status === 'error' ? state.values?.[name] : product?.values[name]) ?? ''
  const errors = (name: ProductField) => state.fieldErrors?.[name]
  const conflict = state.conflict
  // After a conflict, the next save is made against THEIR version.
  const version = conflict?.version ?? product?.version

  const changed = conflict ? (Object.keys(LABELS) as ProductField[]).filter((f) => (state.values?.[f] ?? '') !== conflict.theirs[f]) : []
  const show = (field: ProductField, raw: string) => {
    if (field === 'categoryId') return categories.find((c) => String(c.id) === raw)?.name ?? (conflict && raw === conflict.theirs.categoryId ? conflict.labels.category : raw)
    if (field === 'supplierId') return raw === '' ? 'None' : (suppliers.find((s) => String(s.id) === raw)?.name ?? conflict?.labels.supplier ?? raw)
    if (field === 'costPrice' || field === 'sellingPrice') return `₦${raw}`
    return raw
  }

  return (
    <form action={action} noValidate className="space-y-5">
      <ErrorSummary state={state} labels={LABELS} />

      {conflict ? (
        <div role="region" aria-labelledby="conflict-title" className="rounded-control border-2 border-warning bg-warning-soft p-4">
          <h2 id="conflict-title" className="flex items-center gap-2 font-sans text-base font-bold text-warning">
            <Icon name="alert" />
            What changed since you opened this form
          </h2>
          {changed.length === 0 ? (
            <p className="mt-2 text-sm">Their saved values are the same as yours. Save again to confirm.</p>
          ) : (
            <div className="relative mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Your values compared with the values saved by someone else</caption>
                <thead>
                  <tr className="border-b border-warning/40">
                    <th scope="col" className="py-1.5 pr-3">Field</th>
                    <th scope="col" className="py-1.5 pr-3">Your value</th>
                    <th scope="col" className="py-1.5">Saved by someone else</th>
                  </tr>
                </thead>
                <tbody>
                  {changed.map((field) => (
                    <tr key={field} className="border-b border-warning/20">
                      <th scope="row" className="py-1.5 pr-3 font-semibold">{LABELS[field]}</th>
                      <td className="py-1.5 pr-3">{show(field, state.values?.[field] ?? '')}</td>
                      <td className="py-1.5">{show(field, conflict.theirs[field])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-sm">
            <strong>Save</strong> keeps your values. To keep theirs instead, <a href={product ? `/products/${product.id}/edit` : '#'} className="font-semibold underline">reload the form</a>.
          </p>
        </div>
      ) : null}

      {product ? (
        <>
          <input type="hidden" name="id" value={product.id} />
          <input type="hidden" name="version" value={version} />
        </>
      ) : null}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <TextField
          name="sku"
          label={LABELS.sku}
          required
          maxLength={32}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          hint="The shelf-label code, e.g. PRV-MILO-500G"
          defaultValue={value('sku')}
          errors={errors('sku')}
          className="sm:col-span-1"
        />
        <TextField name="name" label={LABELS.name} required maxLength={LIMITS.name} autoComplete="off" defaultValue={value('name')} errors={errors('name')} className="sm:col-span-2" />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <SelectField name="categoryId" label={LABELS.categoryId} required defaultValue={value('categoryId')} errors={errors('categoryId')}>
          <option value="">Choose…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.archived ? ' (archived)' : ''}
            </option>
          ))}
        </SelectField>
        <SelectField name="supplierId" label={LABELS.supplierId} defaultValue={value('supplierId')} errors={errors('supplierId')} hint="Used to group the low-stock report">
          <option value="">None (bought at the market)</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.archived ? ' (archived)' : ''}
            </option>
          ))}
        </SelectField>
        <SelectField name="unit" label={LABELS.unit} required defaultValue={value('unit') || 'piece'} errors={errors('unit')}>
          {UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </SelectField>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <NairaField name="costPrice" label={LABELS.costPrice} required placeholder="0.00" hint="What we pay, per unit" defaultValue={value('costPrice')} errors={errors('costPrice')} />
        <NairaField name="sellingPrice" label={LABELS.sellingPrice} required placeholder="0.00" hint="What customers pay" defaultValue={value('sellingPrice')} errors={errors('sellingPrice')} />
        <TextField
          name="reorderLevel"
          label={LABELS.reorderLevel}
          required
          inputMode="numeric"
          pattern="[0-9]*"
          hint="Warn when the total is at or below this"
          defaultValue={value('reorderLevel') || '0'}
          errors={errors('reorderLevel')}
          className="[&_input]:tabular-nums"
        />
      </div>

      {!product ? <p className="text-sm text-muted">New products start with 0 in stock everywhere. Record a receipt to add the first stock, so the ledger explains every unit.</p> : null}

      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingLabel="Saving…">{product ? 'Save changes' : 'Add product'}</SubmitButton>
        <Link href={product ? `/products/${product.id}` : '/products'} className={button.secondary}>
          Cancel
        </Link>
      </div>
    </form>
  )
}
