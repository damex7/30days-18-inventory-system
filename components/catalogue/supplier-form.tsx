'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { saveSupplierAction, type SupplierField } from '@/app/(app)/suppliers/actions'
import { ErrorSummary } from '@/components/forms/error-summary'
import { TextAreaField, TextField } from '@/components/forms/field'
import { SubmitButton } from '@/components/forms/submit-button'
import { button } from '@/components/ui/button'
import { LIMITS } from '@/lib/inventory/validation'
import type { FormState } from '@/lib/validation'

const LABELS: Record<SupplierField, string> = {
  name: 'Supplier name',
  contactPerson: 'Contact person',
  phone: 'Phone (Nigerian mobile)',
  email: 'Email',
  address: 'Address',
  notes: 'Notes',
}

/** Add or edit a supplier. Typed values are kept after an error; the phone is checked and stored as +234… on the server. */
export function SupplierForm({ supplier, cancelHref }: { supplier?: { id: number } & Partial<Record<SupplierField, string>>; cancelHref: string }) {
  const [state, action] = useActionState(saveSupplierAction, { status: 'idle' } satisfies FormState<SupplierField>)
  const value = (name: SupplierField) => (state.status === 'error' ? state.values?.[name] : supplier?.[name]) ?? ''
  const errors = (name: SupplierField) => state.fieldErrors?.[name]

  return (
    <form action={action} noValidate className="space-y-5">
      <ErrorSummary state={state} labels={LABELS} />
      {supplier ? <input type="hidden" name="id" value={supplier.id} /> : null}
      <TextField name="name" label={LABELS.name} required maxLength={LIMITS.name} autoComplete="organization" defaultValue={value('name')} errors={errors('name')} />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <TextField name="contactPerson" label={LABELS.contactPerson} maxLength={LIMITS.person} autoComplete="name" defaultValue={value('contactPerson')} errors={errors('contactPerson')} />
        <TextField
          name="phone"
          label={LABELS.phone}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          hint="e.g. 0803 123 4567 or +234 803 123 4567"
          defaultValue={value('phone')}
          errors={errors('phone')}
        />
      </div>
      <TextField name="email" label={LABELS.email} type="email" autoComplete="email" maxLength={254} defaultValue={value('email')} errors={errors('email')} />
      <TextAreaField name="address" label={LABELS.address} rows={2} maxLength={LIMITS.address} defaultValue={value('address')} errors={errors('address')} />
      <TextAreaField name="notes" label={LABELS.notes} hint="Delivery days, credit terms, anything staff should know." maxLength={LIMITS.notes} defaultValue={value('notes')} errors={errors('notes')} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingLabel="Saving…">{supplier ? 'Save changes' : 'Add supplier'}</SubmitButton>
        <Link href={cancelHref} className={button.secondary}>
          Cancel
        </Link>
      </div>
    </form>
  )
}
