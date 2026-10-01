import { cloneElement } from 'react'

/**
 * Formularfeld mit Beschriftung, Hinweis und Fehlermeldung. `children` ist genau ein Eingabeelement; es bekommt
 * `id`, `aria-invalid` und `aria-describedby` (Hinweis und Fehler). Die Fehlermeldung wird vorgelesen (role="alert").
 */
export default function FormField({ id, label, hint, error, children }) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className="field fin-form-field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id, 'aria-invalid': error ? 'true' : undefined, 'aria-describedby': describedBy })}
      {hint && (
        <div id={hintId} className="faint fin-form-hint">
          {hint}
        </div>
      )}
      {error && (
        <div id={errorId} className="fin-field-error" role="alert">
          {error}
        </div>
      )}
    </div>
  )
}
