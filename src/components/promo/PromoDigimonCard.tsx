import type { CSSProperties } from 'react'
import {
  PROMO_OBTAIN_LABELS,
  promoNcImage,
  type PromoEntry,
  type PromoObtainKind,
  type PromoObtainMethod,
} from '../../lib/patchPromoDigimon'

const KIND_ORDER: PromoObtainKind[] = ['shop', 'farm', 'quest']

function sortMethods(methods: PromoObtainMethod[]) {
  return [...methods].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
  )
}

type PromoDigimonCardProps = {
  entry: PromoEntry
  index: number
  size?: 'featured' | 'line'
}

export function PromoDigimonCard({
  entry,
  index,
  size = 'line',
}: PromoDigimonCardProps) {
  const featured = entry.line[entry.line.length - 1]
  const showStrip = entry.line.length > 1
  const methods = sortMethods(entry.methods)
  const pending = entry.status === 'pending'
  const floatDelay = `${(index % 4) * 0.4}s`

  return (
    <article
      className={[
        'promo-stage',
        `promo-stage--${size}`,
        pending ? 'promo-stage--pending' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        {
          '--promo-stagger': String(index),
          '--promo-float-delay': floatDelay,
        } as CSSProperties
      }
    >
      <div className="promo-stage__hud" aria-hidden />
      <div className="promo-stage__grid" aria-hidden />
      <div className="promo-stage__scan" aria-hidden />

      <div className="promo-stage__figure">
        {pending ? <span className="promo-stage__badge">Pending</span> : null}
        <img
          className="promo-stage__portrait"
          src={promoNcImage(featured.image)}
          alt=""
          loading="lazy"
          decoding="async"
        />
        <div className="promo-stage__shadow" aria-hidden />
        <div className="promo-stage__pedestal" aria-hidden />
      </div>

      <div className="promo-stage__body">
        <h2 className="promo-stage__name">{entry.name}</h2>

        {showStrip ? (
          <ol className="promo-evo-strip" aria-label={`${entry.name} evolution line`}>
            {entry.line.map((form, i) => (
              <li key={form.id} className="promo-evo-strip__item">
                {i > 0 ? (
                  <span className="promo-evo-strip__chevron" aria-hidden>
                    ›
                  </span>
                ) : null}
                <figure className="promo-evo-strip__figure">
                  <img
                    src={promoNcImage(form.image)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                  <figcaption>{form.name}</figcaption>
                </figure>
              </li>
            ))}
          </ol>
        ) : null}

        {pending ? (
          <p className="promo-stage__pending-note">
            {entry.pendingNote ?? 'Details coming soon'}
          </p>
        ) : (
          <>
            <ul className="promo-obtain__tags" aria-label="Obtainment methods">
              {methods.map((m) => (
                <li key={m.kind}>
                  <span className={`promo-obtain__tag promo-obtain__tag--${m.kind}`}>
                    {PROMO_OBTAIN_LABELS[m.kind]}
                  </span>
                </li>
              ))}
            </ul>
            <ul className="promo-obtain__details">
              {methods.map((m) => (
                <li key={`${m.kind}-detail`} className="promo-obtain__detail">
                  <span className={`promo-obtain__dot promo-obtain__dot--${m.kind}`} />
                  <span className="promo-obtain__kind">{PROMO_OBTAIN_LABELS[m.kind]}</span>
                  <span className="promo-obtain__text">{m.detail}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </article>
  )
}
