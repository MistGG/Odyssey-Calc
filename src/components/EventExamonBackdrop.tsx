import { EVENT_BACKDROP_SPIRITS, eventBackdropSpiritUrl } from '../lib/eventOdysseyArt'

/** Olympos XII watermarks (Time Stranger model art) behind the event page. */
export function EventExamonBackdrop() {
  return (
    <div className="event-examon-backdrop" aria-hidden>
      <div className="event-examon-backdrop__veil" />
      <div className="event-examon-backdrop__grid" />
      <div className="event-examon-backdrop__flare event-examon-backdrop__flare--crimson" />
      <div className="event-examon-backdrop__flare event-examon-backdrop__flare--violet" />
      <div className="event-examon-backdrop__flare event-examon-backdrop__flare--silver" />
      {EVENT_BACKDROP_SPIRITS.map(({ id, slot }) => {
        const src = eventBackdropSpiritUrl(id)
        if (!src) return null
        return (
          <img
            key={`${id}-${slot}`}
            className={`event-examon-backdrop__spirit event-examon-backdrop__spirit--${slot}`}
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
