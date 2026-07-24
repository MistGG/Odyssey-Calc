/**
 * Mirror-based caret coordinates inside a textarea (content-box origin,
 * before subtracting scrollTop/scrollLeft).
 *
 * Important: keep the mirror height clipped to the textarea and clear text
 * after measuring — otherwise long guides leave a huge live DOM subtree
 * that gets re-laid-out on every cursor tick.
 */

const MIRROR_STYLE_KEYS = [
  'direction',
  'boxSizing',
  'width',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'fontSizeAdjust',
  'lineHeight',
  'fontFamily',
  'textAlign',
  'textTransform',
  'textIndent',
  'textDecoration',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
  'whiteSpace',
  'wordWrap',
  'wordBreak',
] as const

let sharedMirror: HTMLDivElement | null = null

function cssPropName(key: string): string {
  return key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)
}

function getMirror(): HTMLDivElement {
  if (sharedMirror?.isConnected) return sharedMirror
  const el = document.createElement('div')
  el.setAttribute('aria-hidden', 'true')
  el.id = 'community-guide-textarea-caret-mirror'
  el.style.position = 'absolute'
  el.style.visibility = 'hidden'
  el.style.pointerEvents = 'none'
  el.style.top = '0'
  el.style.left = '-9999px'
  el.style.overflow = 'hidden'
  document.body.appendChild(el)
  sharedMirror = el
  return el
}

export type TextareaCaretCoordinates = {
  top: number
  left: number
  height: number
}

export function getTextareaCaretCoordinates(
  textarea: HTMLTextAreaElement,
  position: number,
): TextareaCaretCoordinates {
  const mirror = getMirror()
  const computed = window.getComputedStyle(textarea)

  for (const key of MIRROR_STYLE_KEYS) {
    const value = computed.getPropertyValue(cssPropName(key))
    if (value) mirror.style.setProperty(cssPropName(key), value)
  }

  // Match textarea box; never grow to full document height.
  mirror.style.whiteSpace = 'pre-wrap'
  mirror.style.wordWrap = 'break-word'
  mirror.style.overflow = 'hidden'
  mirror.style.width = `${textarea.clientWidth}px`
  mirror.style.height = `${textarea.clientHeight}px`

  const value = textarea.value
  const clamped = Math.max(0, Math.min(position, value.length))
  mirror.textContent = value.slice(0, clamped)

  const marker = document.createElement('span')
  marker.textContent = value.slice(clamped, clamped + 1) || '.'
  mirror.appendChild(marker)

  const borderTop = Number.parseFloat(computed.borderTopWidth) || 0
  const borderLeft = Number.parseFloat(computed.borderLeftWidth) || 0
  const lineHeight =
    Number.parseFloat(computed.lineHeight) ||
    marker.offsetHeight ||
    (Number.parseFloat(computed.fontSize) || 16) * 1.2

  const coords = {
    top: marker.offsetTop + borderTop,
    left: marker.offsetLeft + borderLeft,
    height: lineHeight,
  }

  // Drop retained guide text from the live document between measures.
  mirror.textContent = ''

  return coords
}
