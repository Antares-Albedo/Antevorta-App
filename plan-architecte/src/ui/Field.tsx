import { useEffect, useId, useState, type ReactNode, type SelectHTMLAttributes } from 'react'
import { formatNombre, parseNombre } from '../model/format'

interface BaseProps {
  label: string
  /** Texte d'infobulle (aide contextuelle). */
  aide?: string
  error?: string
  className?: string
  children?: ReactNode
}

export function FieldWrapper({ label, aide, error, className, children, htmlFor, errorId }: BaseProps & { htmlFor: string; errorId: string }) {
  return (
    <div className={`flex flex-col gap-0.5 ${className ?? ''}`}>
      <label htmlFor={htmlFor} className="flex items-center gap-1 text-xs font-medium text-slate-700" title={aide}>
        {label}
        {aide && (
          <span className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full bg-slate-200 text-[10px] text-slate-600" aria-label={aide} title={aide}>
            ?
          </span>
        )}
      </label>
      {children}
      {error && (
        <p id={errorId} className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

interface NumberFieldProps extends BaseProps {
  value: number | undefined
  onChange: (value: number) => void
  unit?: string
  step?: number
  min?: number
  max?: number
  decimals?: number
  disabled?: boolean
  placeholder?: string
  testId?: string
}

/** Champ numérique acceptant la virgule décimale française ; met à jour dès que la saisie est un nombre. */
export function NumberField({ label, aide, error, className, value, onChange, unit, step = 0.01, min, max, decimals = 2, disabled, placeholder, testId }: NumberFieldProps) {
  const id = useId()
  const errorId = `${id}-err`
  const [text, setText] = useState(value === undefined ? '' : formatNombre(value, decimals))
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setText(value === undefined || Number.isNaN(value) ? '' : formatNombre(value, decimals))
  }, [value, focused, decimals])
  return (
    <FieldWrapper label={label} aide={aide} error={error} className={className} htmlFor={id} errorId={errorId}>
      <div className="flex items-center gap-1">
        <input
          id={id}
          data-testid={testId}
          className="field-input"
          type="text"
          inputMode="decimal"
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          title={aide}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            const n = parseNombre(text)
            if (Number.isFinite(n)) {
              const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))
              if (clamped !== value) onChange(Math.round(clamped * 10 ** decimals) / 10 ** decimals)
            }
          }}
          onChange={(e) => {
            setText(e.target.value)
            const n = parseNombre(e.target.value)
            if (Number.isFinite(n)) onChange(Math.round(n * 10 ** decimals) / 10 ** decimals)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault()
              const base = Number.isFinite(parseNombre(text)) ? parseNombre(text) : (value ?? 0)
              const n = Math.round((base + (e.key === 'ArrowUp' ? step : -step)) * 10 ** decimals) / 10 ** decimals
              setText(formatNombre(n, decimals))
              onChange(n)
            }
          }}
        />
        {unit && <span className="shrink-0 text-xs text-slate-500">{unit}</span>}
      </div>
    </FieldWrapper>
  )
}

interface TextFieldProps extends BaseProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  testId?: string
}

export function TextField({ label, aide, error, className, value, onChange, placeholder, testId }: TextFieldProps) {
  const id = useId()
  const errorId = `${id}-err`
  return (
    <FieldWrapper label={label} aide={aide} error={error} className={className} htmlFor={id} errorId={errorId}>
      <input id={id} data-testid={testId} className="field-input" type="text" value={value} placeholder={placeholder} title={aide} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} onChange={(e) => onChange(e.target.value)} />
    </FieldWrapper>
  )
}

interface SelectFieldProps extends BaseProps {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  testId?: string
  selectProps?: SelectHTMLAttributes<HTMLSelectElement>
}

export function SelectField({ label, aide, error, className, value, onChange, options, testId, selectProps }: SelectFieldProps) {
  const id = useId()
  const errorId = `${id}-err`
  return (
    <FieldWrapper label={label} aide={aide} error={error} className={className} htmlFor={id} errorId={errorId}>
      <select id={id} data-testid={testId} className="field-input" value={value} title={aide} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} onChange={(e) => onChange(e.target.value)} {...selectProps}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldWrapper>
  )
}

interface CheckboxFieldProps {
  label: string
  aide?: string
  checked: boolean
  onChange: (checked: boolean) => void
  className?: string
}

export function CheckboxField({ label, aide, checked, onChange, className }: CheckboxFieldProps) {
  const id = useId()
  return (
    <label htmlFor={id} className={`flex items-center gap-2 text-xs text-slate-700 ${className ?? ''}`} title={aide}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} title={aide} />
      {label}
    </label>
  )
}
