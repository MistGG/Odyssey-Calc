import { useState, type RefObject } from 'react'
import {
  COMMUNITY_GUIDE_FONT_FAMILIES,
  COMMUNITY_GUIDE_FONT_GROUPS,
  COMMUNITY_GUIDE_FONT_SIZES,
  type CommunityGuideFontFamily,
  type CommunityGuideFontSize,
} from '../../lib/communityGuideFontMarkup'
import {
  insertTextareaBlock,
  prefixTextareaLines,
  setTextareaLinePrefix,
  wrapTextareaFontSpan,
  wrapTextareaSelection,
} from '../../lib/communityGuideMarkdownInsert'

type CommunityGuideMarkdownToolbarProps = {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  onChange: (value: string) => void
}

function run(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  onChange: (v: string) => void,
  fn: (el: HTMLTextAreaElement) => string,
) {
  const el = textareaRef.current
  if (!el) return
  onChange(fn(el))
}

export function CommunityGuideMarkdownToolbar({
  textareaRef,
  onChange,
}: CommunityGuideMarkdownToolbarProps) {
  const [fontFamily, setFontFamily] = useState<CommunityGuideFontFamily>('')
  const [fontSize, setFontSize] = useState<CommunityGuideFontSize>('')

  const applyFont = (family: CommunityGuideFontFamily, size: CommunityGuideFontSize) => {
    if (!family && !size) return
    run(textareaRef, onChange, (el) => wrapTextareaFontSpan(el, family, size))
  }

  return (
    <div className="community-guide-md-toolbar" role="toolbar" aria-label="Formatting">
      <div className="community-guide-md-toolbar__row">
        <label className="community-guide-md-toolbar__select-wrap">
          <span className="community-guide-md-toolbar__select-label">Font</span>
          <select
            className="community-guide-md-toolbar__select community-guide-md-toolbar__select--font"
            value={fontFamily}
            onChange={(e) => {
              const next = e.target.value as CommunityGuideFontFamily
              setFontFamily(next)
              applyFont(next, fontSize)
            }}
          >
            {COMMUNITY_GUIDE_FONT_GROUPS.map((group) => (
              <optgroup key={group} label={group}>
                {COMMUNITY_GUIDE_FONT_FAMILIES.filter((opt) => opt.group === group).map((opt) => (
                  <option key={opt.id || 'default'} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label className="community-guide-md-toolbar__select-wrap">
          <span className="community-guide-md-toolbar__select-label">Size</span>
          <select
            className="community-guide-md-toolbar__select"
            value={fontSize}
            onChange={(e) => {
              const next = e.target.value as CommunityGuideFontSize
              setFontSize(next)
              applyFont(fontFamily, next)
            }}
          >
            {COMMUNITY_GUIDE_FONT_SIZES.map((opt) => (
              <option key={opt.id || 'default'} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="community-guide-md-toolbar__row">
        <span className="community-guide-md-toolbar__label">Text</span>
        <button
          type="button"
          className="community-guide-md-toolbar__btn"
          title="Bold"
          onClick={() => run(textareaRef, onChange, (el) => wrapTextareaSelection(el, '**', '**', 'bold'))}
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          className="community-guide-md-toolbar__btn"
          title="Italic"
          onClick={() => run(textareaRef, onChange, (el) => wrapTextareaSelection(el, '*', '*', 'italic'))}
        >
          <em>I</em>
        </button>
        <button
          type="button"
          className="community-guide-md-toolbar__btn"
          title="Strikethrough"
          onClick={() => run(textareaRef, onChange, (el) => wrapTextareaSelection(el, '~~', '~~', 'strike'))}
        >
          <s>S</s>
        </button>
        <button
          type="button"
          className="community-guide-md-toolbar__btn community-guide-md-toolbar__btn--mono"
          title="Inline code"
          onClick={() => run(textareaRef, onChange, (el) => wrapTextareaSelection(el, '`', '`', 'code'))}
        >
          {'</>'}
        </button>
        <button
          type="button"
          className="community-guide-md-toolbar__btn"
          title="Link"
          onClick={() =>
            run(textareaRef, onChange, (el) =>
              wrapTextareaSelection(el, '[', '](https://)', 'link text'),
            )
          }
        >
          Link
        </button>
      </div>

      <div className="community-guide-md-toolbar__row">
        <span className="community-guide-md-toolbar__label">Blocks</span>
        <button
          type="button"
          className="community-guide-md-toolbar__btn"
          title="Heading 2"
          onClick={() => run(textareaRef, onChange, (el) => setTextareaLinePrefix(el, '## ', 'Section'))}
        >
          H2
        </button>
        <button
          type="button"
          className="community-guide-md-toolbar__btn"
          title="Heading 3"
          onClick={() => run(textareaRef, onChange, (el) => setTextareaLinePrefix(el, '### ', 'Subsection'))}
        >
          H3
        </button>
        <button
          type="button"
          className="community-guide-md-toolbar__btn"
          title="Bullet list"
          onClick={() => run(textareaRef, onChange, (el) => prefixTextareaLines(el, '- '))}
        >
          • List
        </button>
        <button
          type="button"
          className="community-guide-md-toolbar__btn"
          title="Numbered list"
          onClick={() => run(textareaRef, onChange, (el) => prefixTextareaLines(el, '1. '))}
        >
          1. List
        </button>
        <button
          type="button"
          className="community-guide-md-toolbar__btn"
          title="Quote"
          onClick={() => run(textareaRef, onChange, (el) => prefixTextareaLines(el, '> '))}
        >
          Quote
        </button>
        <button
          type="button"
          className="community-guide-md-toolbar__btn"
          title="Divider"
          onClick={() => run(textareaRef, onChange, (el) => insertTextareaBlock(el, '---'))}
        >
          —
        </button>
        <button
          type="button"
          className="community-guide-md-toolbar__btn"
          title="Image from URL"
          onClick={() =>
            run(textareaRef, onChange, (el) =>
              insertTextareaBlock(el, '![Image description](https://)'),
            )
          }
        >
          Image
        </button>
      </div>
    </div>
  )
}
