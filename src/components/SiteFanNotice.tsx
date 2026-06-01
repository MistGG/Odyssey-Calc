const OFFICIAL_GAME_URL = 'https://thedigitalodyssey.com/'

export function SiteFanBanner() {
  return (
    <div className="site-fan-banner" role="note">
      <p className="site-fan-banner__text">
        <strong>Unofficial fan site.</strong> Odyssey Calc is community-made tools (meter, tier list,
        guidebook). Not affiliated with or operated by{' '}
        <a href={OFFICIAL_GAME_URL} target="_blank" rel="noreferrer noopener">
          Digital Odyssey
        </a>
        . Sign-in here is only for this website, not your game account.
      </p>
    </div>
  )
}

export function SiteFanFooter() {
  return (
    <footer className="site-fan-footer">
      <p>
        Odyssey Calc · Fan-made ·{' '}
        <a href={OFFICIAL_GAME_URL} target="_blank" rel="noreferrer noopener">
          Official game site
        </a>
      </p>
    </footer>
  )
}
