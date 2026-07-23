import type { CSSProperties } from 'react'
import { PromoDigimonCard } from '../components/promo/PromoDigimonCard'
import { PromoDigicodeGlitch } from '../components/promo/PromoDigicodeGlitch'
import {
  promoFeaturedEntries,
  promoLineEntries,
} from '../lib/patchPromoDigimon'

export function PatchPromoPage() {
  const featured = promoFeaturedEntries()
  const lines = promoLineEntries()

  return (
    <div className="patch-promo">
      <section className="patch-promo-hero" aria-labelledby="patch-promo-title">
        <div className="patch-promo-hero__grid" aria-hidden />
        <div className="patch-promo-hero__scan" aria-hidden />
        <div className="patch-promo-hero__stream" aria-hidden />
        <div className="patch-promo-hero__inner">
          <div className="patch-promo-hero__copy">
            <p className="patch-promo-hero__kicker">Odyssey Calc · Patch showcase</p>
            <h1 id="patch-promo-title" className="patch-promo-hero__title">
              New Digimon
            </h1>
            <p className="patch-promo-hero__lead">
              Incoming Digimon for this patch and how to obtain them!
            </p>
            <ul className="patch-promo-legend" aria-label="Obtainment legend">
              <li>
                <span className="promo-obtain__tag promo-obtain__tag--shop">Shop</span>
                <span>Gacha & cash shop</span>
              </li>
              <li>
                <span className="promo-obtain__tag promo-obtain__tag--farm">Farm</span>
                <span>Overworld, dungeon, tickets</span>
              </li>
              <li>
                <span className="promo-obtain__tag promo-obtain__tag--quest">Quest</span>
                <span>Questlines</span>
              </li>
            </ul>
          </div>
          <aside className="patch-promo-hero__more" aria-label="Additional Digimon">
            <p className="patch-promo-hero__more-kicker">And more…</p>
            <p className="patch-promo-hero__more-lead">such as</p>
            <ul className="patch-promo-hero__more-list">
              <li>Dorumon X</li>
              <li>Fanbeemon X</li>
              <li>Ryudamon X</li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="patch-promo-section" aria-labelledby="patch-promo-featured">
        <header className="patch-promo-section__head">
          <p className="patch-promo-section__kicker">Featured</p>
          <h2 id="patch-promo-featured" className="patch-promo-section__title">
            Signature Digimon
          </h2>
        </header>
        <div className="patch-promo-showcase">
          {featured.map((entry, index) => (
            <PromoDigimonCard
              key={entry.id}
              entry={entry}
              index={index}
              size="featured"
            />
          ))}
          <article
            className="promo-stage promo-stage--featured promo-stage--soon"
            style={
              {
                '--promo-stagger': String(featured.length),
                '--promo-float-delay': `${(featured.length % 4) * 0.4}s`,
              } as CSSProperties
            }
            aria-label="Encrypted Digimon"
          >
            <div className="promo-stage__hud" aria-hidden />
            <div className="promo-stage__grid" aria-hidden />
            <div className="promo-stage__scan" aria-hidden />
            <div className="promo-stage__figure">
              <div className="promo-stage__soon-logo" aria-hidden>
                <img
                  className="promo-stage__soon-logo__base"
                  src={`${import.meta.env.BASE_URL}logo.png`}
                  alt=""
                  width={120}
                  height={120}
                  decoding="async"
                />
                <span
                  className="promo-stage__soon-logo__glitch promo-stage__soon-logo__glitch--light"
                  style={
                    {
                      backgroundImage: `url(${import.meta.env.BASE_URL}logo.png)`,
                    } as CSSProperties
                  }
                />
                <span
                  className="promo-stage__soon-logo__glitch promo-stage__soon-logo__glitch--dark"
                  style={
                    {
                      backgroundImage: `url(${import.meta.env.BASE_URL}logo.png)`,
                    } as CSSProperties
                  }
                />
              </div>
              <div className="promo-stage__shadow" aria-hidden />
              <div className="promo-stage__pedestal" aria-hidden />
            </div>
            <div className="promo-stage__body">
              <h2 className="promo-stage__name promo-stage__name--digicode">
                <PromoDigicodeGlitch />
              </h2>
              <ul className="promo-obtain__tags" aria-label="Obtainment methods">
                <li>
                  <span className="promo-obtain__tag promo-obtain__tag--quest">
                    Quest
                  </span>
                </li>
              </ul>
              <ul className="promo-obtain__details">
                <li className="promo-obtain__detail">
                  <span className="promo-obtain__dot promo-obtain__dot--quest" />
                  <span className="promo-obtain__kind">Quest</span>
                  <span className="promo-obtain__text">Questline</span>
                </li>
              </ul>
            </div>
          </article>
        </div>
      </section>

      <section className="patch-promo-section" aria-labelledby="patch-promo-lines">
        <header className="patch-promo-section__head">
          <p className="patch-promo-section__kicker">Verdandi lines</p>
          <h2 id="patch-promo-lines" className="patch-promo-section__title">
            X-Antibody evolution paths
          </h2>
        </header>
        <div className="patch-promo-lines">
          {lines.map((entry, index) => (
            <PromoDigimonCard
              key={entry.id}
              entry={entry}
              index={index + featured.length}
              size="line"
            />
          ))}
        </div>
      </section>
    </div>
  )
}
