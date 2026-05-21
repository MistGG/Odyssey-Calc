import { MARSMON_TEASER_FLAMES, MARSMON_TEASER_RADIANCE } from './marsmonTeaserConfig'
import { TeaserMarsmonRuneReveal } from './TeaserMarsmonRuneReveal'
import { useMarsmonTeaserCycle } from './useMarsmonTeaserCycle'

export type TeaserMarsmonEffectsProps = {
  enabled?: boolean
}

const SPARK_SLOTS = ['a', 'b', 'c', 'd'] as const

/**
 * Plain-teaser overlays for 6JQlbLZ: rune reveal → hold → sun burst → replay.
 */
export function TeaserMarsmonEffects({ enabled = true }: TeaserMarsmonEffectsProps) {
  const { cycleKey, phase } = useMarsmonTeaserCycle(enabled)

  if (!enabled) return null

  const [r, g, b] = MARSMON_TEASER_RADIANCE.rgb
  const fxPhaseClass =
    phase === 'sunburst'
      ? ' teaser-marsmon-fx--sunburst'
      : phase === 'hold'
        ? ' teaser-marsmon-fx--hold'
        : phase === 'fadeout'
          ? ' teaser-marsmon-fx--fadeout'
          : phase === 'reset'
            ? ' teaser-marsmon-fx--reset'
            : ''

  return (
    <div className={`teaser-marsmon-fx${fxPhaseClass}`}>
      <div className="teaser-marsmon-fx__decor" aria-hidden>
        <div
          className="teaser-marsmon-radiance"
          style={{
            left: `${MARSMON_TEASER_RADIANCE.xPct}%`,
            top: `${MARSMON_TEASER_RADIANCE.yPct}%`,
            ['--marsmon-r' as string]: String(r),
            ['--marsmon-g' as string]: String(g),
            ['--marsmon-b' as string]: String(b),
          }}
        >
          <span className="teaser-marsmon-radiance__halo" />
          <span className="teaser-marsmon-radiance__core" />
          <span className="teaser-marsmon-radiance__rays" />
        </div>

        <div
          className="teaser-marsmon-sunburst"
          style={{
            left: `${MARSMON_TEASER_RADIANCE.xPct}%`,
            top: `${MARSMON_TEASER_RADIANCE.yPct}%`,
          }}
        />
        <div
          className="teaser-marsmon-envelope"
          style={{
            ['--marsmon-envelope-x' as string]: `${MARSMON_TEASER_RADIANCE.xPct}%`,
            ['--marsmon-envelope-y' as string]: `${MARSMON_TEASER_RADIANCE.yPct}%`,
          }}
        />

        {MARSMON_TEASER_FLAMES.map((flame, i) => (
          <span
            key={i}
            className="teaser-marsmon-flame"
            style={{
              left: `${flame.xPct}%`,
              top: `${flame.yPct}%`,
              ['--flame-rot' as string]: `${flame.rotateDeg}deg`,
              ['--flame-delay' as string]: `${flame.delayMs}ms`,
              ['--flame-cycle' as string]: `${flame.cycleMs}ms`,
            }}
          >
            <span className="teaser-marsmon-flame__body" />
            {SPARK_SLOTS.map((slot) => (
              <span
                key={slot}
                className={`teaser-marsmon-flame__spark teaser-marsmon-flame__spark--${slot}`}
              />
            ))}
          </span>
        ))}
      </div>

      <TeaserMarsmonRuneReveal key={cycleKey} enabled={phase !== 'reset'} />
    </div>
  )
}
