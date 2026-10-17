import type { InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** The ids that tie a field to its hint and error, for aria-describedby. */
export function fieldIds(name: string) {
  return { input: name, hint: `${name}-hint`, error: `${name}-error` }
}

/** Joins the ids of whatever descriptions this field actually has. */
export function describedBy(name: string, hasHint: boolean, hasError: boolean): string | undefined {
  const ids = fieldIds(name)
  const parts = [hasHint && ids.hint, hasError && ids.error].filter(Boolean)
  return parts.length ? parts.join(' ') : undefined
}

/** The message(s) under a field. The id is what the input's aria-describedby points at. */
export function FieldError({ name, errors }: { name: string; errors?: string[] }) {
  if (!errors?.length) return null
  return (
    <p id={fieldIds(name).error} className="mt-1.5 flex items-start gap-1.5 text-sm font-semibold text-danger">
      <span aria-hidden className="mt-px">✕</span>
      {/* "Error:" is for screen readers; sighted users have the colour, icon and position. */}
      <span>
        <span className="sr-only">Error: </span>
        {errors[0]}
      </span>
    </p>
  )
}

type TextFieldProps = {
  name: string
  label: string
  hint?: ReactNode
  errors?: string[]
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'name' | 'id'>

/**
 * A labelled text input with an optional hint and an inline error.
 * - <label htmlFor> is linked to the input's id: clicking the label focuses
 *   it, and screen readers announce the label.
 * - aria-describedby points at the hint and the error, so both are read
 *   out when the field gets focus.
 * - aria-invalid marks it invalid for assistive tech (and gives it the
 *   crimson border in globals.css).
 */
export function TextField({ name, label, hint, errors, className, ...input }: TextFieldProps) {
  const ids = fieldIds(name)
  const invalid = Boolean(errors?.length)
  return (
    <div className={className}>
      <label htmlFor={ids.input} className="mb-1.5 block font-semibold">
        {label}
      </label>
      {hint ? (
        <p id={ids.hint} className="-mt-1 mb-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
      <input
        id={ids.input}
        name={name}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy(name, Boolean(hint), invalid)}
        className={cn('field block min-h-12 w-full px-3.5 text-base')}
        {...input}
      />
      <FieldError name={name} errors={errors} />
    </div>
  )
}
