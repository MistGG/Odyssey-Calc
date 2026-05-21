import {
  MARSMON_RUNE_FLIP_BASE_MS,
  MARSMON_RUNE_FLIP_STAGGER_MS,
  MARSMON_RUNE_GLYPHS,
} from './marsmonRuneGlyphs'

export type TeaserMarsmonRuneRevealProps = {
  enabled?: boolean
}

/**
 * English over each rune glyph; reveals left → right with a 3D flip.
 */
export function TeaserMarsmonRuneReveal({ enabled = true }: TeaserMarsmonRuneRevealProps) {
  if (!enabled) return null

  return (
    <div
      className="teaser-marsmon-runes"
      role="group"
      aria-label="Teaser inscription: HE SEES HE CONQUERS. HONEY THE CROWDS. WERE GOING BONKERS."
      style={{
        ['--rune-flip-base' as string]: `${MARSMON_RUNE_FLIP_BASE_MS}ms`,
        ['--rune-flip-stagger' as string]: `${MARSMON_RUNE_FLIP_STAGGER_MS}ms`,
      }}
    >
      {MARSMON_RUNE_GLYPHS.map((glyph, i) => (
        <span
          key={`${glyph.flipIndex}-${i}-${glyph.char}`}
          className="teaser-marsmon-rune-char"
          style={{
            left: `${glyph.xPct}%`,
            top: `${glyph.yPct}%`,
            width: `${glyph.wPct}%`,
            height: `${glyph.hPct}%`,
            ['--flip-i' as string]: String(glyph.flipIndex),
          }}
        >
          <span className="teaser-marsmon-rune-char__face">{glyph.char}</span>
        </span>
      ))}
    </div>
  )
}
