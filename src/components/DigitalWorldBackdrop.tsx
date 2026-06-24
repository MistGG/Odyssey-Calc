/** Single muted Digimon digital-world background image. */
export function DigitalWorldBackdrop() {
  return (
    <div className="digital-world-backdrop" aria-hidden>
      <img
        className="digital-world-backdrop__image"
        src={`${import.meta.env.BASE_URL}digital-world-bg.png`}
        alt=""
        decoding="async"
        fetchPriority="low"
      />
      <div className="digital-world-backdrop__veil" />
    </div>
  )
}
