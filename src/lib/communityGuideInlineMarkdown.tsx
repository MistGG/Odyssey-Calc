import type { ReactNode } from 'react'
import { CommunityGuideImage } from '../components/communityGuides/CommunityGuideImage'
import { isAllowedCommunityGuideImageUrl } from './communityGuideImageUrl'
import { parseCommunityGuideFontSpanClasses } from './communityGuideFontMarkup'

const FONT_SPAN_RE = /<span class="(cg-font[^"]*)">([\s\S]*?)<\/span>/g

const INLINE_MD_RE =
  /(\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|`[^`]+`|!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\))/g

function renderInlineMarkdownToken(token: string, key: string): ReactNode {
  if (token.startsWith('**')) {
    return <strong key={key}>{token.slice(2, -2)}</strong>
  }
  if (token.startsWith('*')) {
    return <em key={key}>{token.slice(1, -1)}</em>
  }
  if (token.startsWith('~~')) {
    return <s key={key}>{token.slice(2, -2)}</s>
  }
  if (token.startsWith('`')) {
    return (
      <code key={key} className="community-guide-md__code">
        {token.slice(1, -1)}
      </code>
    )
  }
  const imageMatch = token.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
  if (imageMatch) {
    const alt = imageMatch[1] ?? ''
    const url = imageMatch[2] ?? ''
    if (!isAllowedCommunityGuideImageUrl(url)) {
      return (
        <span key={key} className="community-guide-md__img-invalid">
          Invalid image URL
        </span>
      )
    }
    return <CommunityGuideImage key={key} src={url} alt={alt} inline />
  }
  const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
  if (linkMatch) {
    return (
      <a
        key={key}
        href={linkMatch[2]}
        target="_blank"
        rel="noreferrer noopener"
        className="community-guide-md__link"
      >
        {linkMatch[1]}
      </a>
    )
  }
  return token
}

function renderInlineMarkdownSegment(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  let i = 0

  while ((match = INLINE_MD_RE.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    nodes.push(renderInlineMarkdownToken(match[0], `${keyPrefix}-m-${i}`))
    last = match.index + match[0].length
    i += 1
  }

  if (last < text.length) nodes.push(text.slice(last))
  return nodes.length ? nodes : [text]
}

/** Inline markdown: font spans, bold, italic, strike, code, images, links. */
export function inlineCommunityGuideMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  let i = 0
  const spanRe = new RegExp(FONT_SPAN_RE.source, 'g')

  while ((match = spanRe.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(...renderInlineMarkdownSegment(text.slice(last, match.index), `${keyPrefix}-pre-${i}`))
    }
    const className = parseCommunityGuideFontSpanClasses(match[1]!)
    const inner = match[2] ?? ''
    nodes.push(
      <span key={`${keyPrefix}-f-${i}`} className={className || 'cg-font'}>
        {renderInlineMarkdownSegment(inner, `${keyPrefix}-f-${i}-in`)}
      </span>,
    )
    last = match.index + match[0].length
    i += 1
  }

  if (last < text.length) {
    nodes.push(...renderInlineMarkdownSegment(text.slice(last), `${keyPrefix}-tail`))
  }

  return nodes.length ? nodes : [text]
}
