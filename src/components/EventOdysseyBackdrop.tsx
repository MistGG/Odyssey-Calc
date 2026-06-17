import { EVENT_BACKDROP_SPIRITS, eventBackdropSpiritUrl } from '../lib/eventOdysseyArt'

/** Olympos XII spirits + grid glow behind the event page. */
export function EventOdysseyBackdrop() {
  return (
    <div className="event-odyssey-backdrop" aria-hidden>
      <div className="event-odyssey-backdrop__grid" />
      <div className="event-odyssey-backdrop__flare event-odyssey-backdrop__flare--cyan" />
      <div className="event-odyssey-backdrop__flare event-odyssey-backdrop__flare--gold" />
      {EVENT_BACKDROP_SPIRITS.map(({ id, slot }) => {
        const src = eventBackdropSpiritUrl(id)
        if (!src) return null
        return (
          <img
            key={`${id}-${slot}`}
            className={`event-odyssey-backdrop__spirit event-odyssey-backdrop__spirit--${slot}`}
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
          />
        )
      })}
    </div>
  )
}
