'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { ErrorSummary } from '@/components/forms/error-summary'
import { TextField } from '@/components/forms/field'
import { SubmitButton } from '@/components/forms/submit-button'
import { button } from '@/components/ui/button'
import type { FormState } from '@/lib/validation'

/**
 * A one-field form (a category or location name), used to add one and to
 * rename one. It keeps what was typed after an error, shows the error under
 * the field and in a summary that takes focus, and clears itself after a
 * successful add.
 */
export function NameForm({
  action,
  label,
  submitLabel,
  defaultValue = '',
  id,
  maxLength,
  cancelHref,
}: {
  action: (state: FormState<'name'>, formData: FormData) => Promise<FormState<'name'>>
  label: string
  submitLabel: string
  defaultValue?: string
  id?: number
  maxLength: number
  cancelHref?: string
}) {
  const [state, formAction] = useActionState(action, { status: 'idle' } satisfies FormState<'name'>)
  return (
    <form action={formAction} noValidate>
      <ErrorSummary state={state} labels={{ name: label }} />
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <TextField
          // A new key after each success remounts the input, clearing it.
          key={state.status === 'success' ? state.submissionId : 'field'}
          name="name"
          label={label}
          required
          maxLength={maxLength}
          autoComplete="off"
          defaultValue={state.status === 'error' ? state.values?.name : defaultValue}
          errors={state.fieldErrors?.name}
          className="flex-1"
        />
        <div className="flex gap-2">
          <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
          {cancelHref ? (
            <Link href={cancelHref} className={button.secondary}>
              Cancel
            </Link>
          ) : null}
        </div>
      </div>
      <p role="status" className="mt-2 text-sm font-semibold text-success">
        {state.status === 'success' ? state.message : null}
      </p>
    </form>
  )
}
