const OFFICIAL_GAME_URL = 'https://thedigitalodyssey.com/'

export function SiteFanFooter() {
  return (
    <footer className="site-fan-footer" role="contentinfo">
      <p className="site-fan-footer__disclaimer">
        <strong>Unofficial fan site.</strong> Odyssey Calc is community-made tools (meter, tier list,
        guidebook). Not affiliated with or operated by{' '}
        <a href={OFFICIAL_GAME_URL} target="_blank" rel="noreferrer noopener">
          Digital Odyssey
        </a>
        .
      </p>
      <p className="site-fan-footer__meta">
        Odyssey Calc · Fan-made ·{' '}
        <a href={OFFICIAL_GAME_URL} target="_blank" rel="noreferrer noopener">
          Official game site
        </a>
      </p>
    </footer>
  )
}
