import { useId, type ReactNode } from 'react'
import { FieldError } from './ui'

interface FieldProps {
  label: string
  optional?: boolean
  hint?: string
  error?: string
  children: (a: { id: string; describedBy?: string; invalid: boolean }) => ReactNode
}

/** Label + control + hint + error wiring (htmlFor, aria-describedby, aria-invalid). */
export function Field({ label, optional, hint, error, children }: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errId = `${id}-err`
  const describedBy = [hint ? hintId : '', error ? errId : ''].filter(Boolean).join(' ') || undefined
  return (
    <div className="field">
      <label htmlFor={id}>
        {label} {optional && <span className="optional">optional</span>}
      </label>
      {hint && <p className="hint" id={hintId}>{hint}</p>}
      {children({ id, describedBy, invalid: Boolean(error) })}
      <FieldError id={errId} message={error} />
    </div>
  )
}
