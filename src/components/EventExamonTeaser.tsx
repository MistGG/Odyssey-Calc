import { EVENT_TEASER_IMAGE_PATH } from '../lib/mayClearEvent'

/** Full Examon art with layered ember flicker and depth occlusion. */
export function EventExamonTeaser() {
  return (
    <figure className="event-examon-teaser">
      <div className="event-examon-teaser__glow-wrap">
        <div className="event-examon-teaser__frame">
          <div className="event-examon-teaser__crop">
            <img
              className="event-examon-teaser__base"
              src={EVENT_TEASER_IMAGE_PATH}
              alt="Examon event artwork"
              width={921}
              height={1152}
              loading="eager"
              decoding="async"
            />
            <img
              className="event-examon-teaser__ember"
              src={EVENT_TEASER_IMAGE_PATH}
              alt=""
              aria-hidden
              width={921}
              height={1152}
              loading="eager"
              decoding="async"
            />
            <div className="event-examon-teaser__shade event-examon-teaser__shade--vignette" aria-hidden />
            <div className="event-examon-teaser__shade event-examon-teaser__shade--floor" aria-hidden />
          </div>
          <div className="event-examon-teaser__occlusion" aria-hidden />
          <div className="event-examon-teaser__ground" aria-hidden />
        </div>
      </div>
    </figure>
  )
}
