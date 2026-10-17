'use client'

import { useActionState } from 'react'
import { createStaffAction, type CreateStaffState } from '@/app/(app)/admin/users/actions'
import { ErrorSummary } from '@/components/forms/error-summary'
import { SelectField, TextField } from '@/components/forms/field'
import { SubmitButton } from '@/components/forms/submit-button'
import { CopyButton } from '@/components/inventory/copy-button'
import { Icon } from '@/components/ui/icon'
import { EMAIL_MAX, NAME_MAX } from '@/lib/validation'

/**
 * Create an account. On success the temporary password appears ONCE, in a
 * box with a copy button. It isn't stored anywhere it could be shown again.
 */
export function CreateStaffForm() {
  const [state, action] = useActionState<CreateStaffState, FormData>(createStaffAction, { status: 'idle' })
  const value = (name: 'name' | 'email' | 'role') => (state.status === 'error' ? state.values?.[name] : undefined) ?? ''

  return (
    <div className="space-y-5">
      {state.created ? (
        <div role="status" className="rounded-control border-2 border-success bg-success-soft p-4">
          <p className="flex items-center gap-2 font-bold text-success">
            <Icon name="checkCircle" />
            {state.message}
          </p>
          <p className="mt-2 text-[0.95rem]">
            Give {state.created.name} this temporary password in person or on WhatsApp. <strong>It is shown only this once.</strong> They’ll choose their own the first
            time they sign in at <span className="break-all">{state.created.email}</span>, and we’ve emailed them a link to confirm the address.
          </p>
          <p className="mt-3 rounded-control border border-line-strong bg-raised px-3 py-2 font-mono text-lg tracking-wide select-all">{state.created.tempPassword}</p>
          <div className="mt-2">
            <CopyButton text={state.created.tempPassword} label="Copy password" />
          </div>
        </div>
      ) : null}

      <form action={action} noValidate className="space-y-4">
        <ErrorSummary state={state} labels={{ name: 'Name', email: 'Email', role: 'Role' }} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_10rem]">
          <TextField key={`n${state.created ? state.submissionId : ''}`} name="name" label="Name" required maxLength={NAME_MAX} autoComplete="off" defaultValue={value('name')} errors={state.fieldErrors?.name} />
          <TextField key={`e${state.created ? state.submissionId : ''}`} name="email" label="Email" type="email" required maxLength={EMAIL_MAX} autoComplete="off" defaultValue={value('email')} errors={state.fieldErrors?.email} />
          <SelectField name="role" label="Role" defaultValue={value('role') || 'staff'} errors={state.fieldErrors?.role}>
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </SelectField>
        </div>
        <SubmitButton pendingLabel="Creating…">
          <Icon name="plus" />
          Create account
        </SubmitButton>
      </form>
    </div>
  )
}
