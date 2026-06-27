import type { CommunityGuideFontFamily, CommunityGuideFontSize } from './communityGuideFontMarkup'
import { communityGuideFontSpanClose, communityGuideFontSpanOpen } from './communityGuideFontMarkup'

export type TextareaEditResult = {
  value: string
  selStart: number
  selEnd: number
}

export function applyTextareaEdit(
  textarea: HTMLTextAreaElement,
  edit: (value: string, start: number, end: number) => TextareaEditResult,
): string {
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const { value, selStart, selEnd } = edit(textarea.value, start, end)
  textarea.value = value
  textarea.selectionStart = selStart
  textarea.selectionEnd = selEnd
  textarea.focus()
  return value
}

export function wrapTextareaSelection(
  textarea: HTMLTextAreaElement,
  before: string,
  after: string,
  placeholder = '',
): string {
  return applyTextareaEdit(textarea, (value, start, end) => {
    const selected = value.slice(start, end) || placeholder
    const next = value.slice(0, start) + before + selected + after + value.slice(end)
    const selStart = start + before.length
    return { value: next, selStart, selEnd: selStart + selected.length }
  })
}

export function prefixTextareaLines(textarea: HTMLTextAreaElement, prefix: string): string {
  return applyTextareaEdit(textarea, (value, start, end) => {
    const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
    const lineEndIdx = value.indexOf('\n', end)
    const blockEnd = lineEndIdx === -1 ? value.length : lineEndIdx
    const block = value.slice(lineStart, blockEnd)
    const prefixed = block
      .split('\n')
      .map((line) => (line.length ? `${prefix}${line}` : prefix.trimEnd()))
      .join('\n')
    const next = value.slice(0, lineStart) + prefixed + value.slice(blockEnd)
    return { value: next, selStart: lineStart, selEnd: lineStart + prefixed.length }
  })
}

export function insertTextareaBlock(textarea: HTMLTextAreaElement, block: string): string {
  const wrapped = block.startsWith('\n') ? block : `\n\n${block}\n\n`
  return applyTextareaEdit(textarea, (value, start) => {
    const next = value.slice(0, start) + wrapped + value.slice(start)
    const pos = start + wrapped.length
    return { value: next, selStart: pos, selEnd: pos }
  })
}

export function setTextareaLinePrefix(
  textarea: HTMLTextAreaElement,
  prefix: string,
  placeholder = 'Heading',
): string {
  return applyTextareaEdit(textarea, (value, start, end) => {
    const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
    const lineEndIdx = value.indexOf('\n', end)
    const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx
    const line = value.slice(lineStart, lineEnd).replace(/^#{1,6}\s+/, '')
    const content = line.trim() || placeholder
    const nextLine = `${prefix}${content}`
    const next = value.slice(0, lineStart) + nextLine + value.slice(lineEnd)
    const selStart = lineStart + prefix.length
    return { value: next, selStart, selEnd: selStart + content.length }
  })
}

export function wrapTextareaFontSpan(
  textarea: HTMLTextAreaElement,
  family: CommunityGuideFontFamily,
  size: CommunityGuideFontSize,
  placeholder = 'text',
): string {
  const open = communityGuideFontSpanOpen(family, size)
  if (!open) return textarea.value
  const close = communityGuideFontSpanClose(family, size)
  return wrapTextareaSelection(textarea, open, close, placeholder)
}
