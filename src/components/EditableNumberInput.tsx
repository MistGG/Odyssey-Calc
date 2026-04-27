import { useEffect, useState } from 'react'

type EditableNumberInputProps = {
  value: number
  onCommit: (nextValue: number) => void
  min?: number
  max?: number
  step?: number
  className?: string
  disabled?: boolean
  integer?: boolean
  emptyValue?: number
}

function clamp(value: number, min?: number, max?: number) {
  let out = value
  if (typeof min === 'number') out = Math.max(min, out)
  if (typeof max === 'number') out = Math.min(max, out)
  return out
}

export function EditableNumberInput({
  value,
  onCommit,
  min,
  max,
  step,
  className,
  disabled,
  integer = true,
  emptyValue,
}: EditableNumberInputProps) {
  const [draft, setDraft] = useState(() => String(value))
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    if (!isEditing) setDraft(String(value))
  }, [value, isEditing])

  const parseDraft = (raw: string) => {
    const trimmed = raw.trim()
    if (trimmed === '') {
      return clamp(emptyValue ?? min ?? value, min, max)
    }
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed)) return clamp(value, min, max)
    const normalized = integer ? Math.floor(parsed) : parsed
    return clamp(normalized, min, max)
  }

  const commitDraft = () => {
    const next = parseDraft(draft)
    onCommit(next)
    setDraft(String(next))
    setIsEditing(false)
  }

  return (
    <input
      className={className}
      type="number"
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      value={draft}
      onFocus={() => setIsEditing(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commitDraft}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commitDraft()
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setDraft(String(value))
          setIsEditing(false)
          ;(e.currentTarget as HTMLInputElement).blur()
        }
      }}
    />
  )
}
