/** Crest emblem for profile Hall of Fame badge (inline SVG, no asset). */
function HallOfFameCrestIcon() {
  return (
    <svg
      className="meter-profile-hof-badge__crest-svg"
      viewBox="0 0 48 48"
      width={40}
      height={40}
      aria-hidden
    >
      <defs>
        <linearGradient id="hof-crest-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fff3c4" />
          <stop offset="45%" stopColor="#e5cc80" />
          <stop offset="100%" stopColor="#b8860b" />
        </linearGradient>
        <linearGradient id="hof-crest-core" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#1e3a5f" />
          <stop offset="100%" stopColor="#0a1628" />
        </linearGradient>
        <filter id="hof-crest-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        d="M24 2 L42 12 V28 L24 46 L6 28 V12 Z"
        fill="url(#hof-crest-gold)"
        opacity={0.95}
      />
      <path
        d="M24 6 L38 14 V26 L24 40 L10 26 V14 Z"
        fill="url(#hof-crest-core)"
        stroke="rgba(229, 204, 128, 0.45)"
        strokeWidth={0.75}
      />
      <path
        d="M24 12 L30 16 V24 L24 34 L18 24 V16 Z"
        fill="none"
        stroke="url(#hof-crest-gold)"
        strokeWidth={1.25}
        filter="url(#hof-crest-glow)"
      />
      <circle cx={24} cy={22} r={3.5} fill="#e5cc80" opacity={0.9} />
      <path
        d="M24 8 v4 M24 32 v4 M8 22 h4 M36 22 h4"
        stroke="#f0ddb0"
        strokeWidth={1}
        strokeLinecap="round"
        opacity={0.55}
      />
    </svg>
  )
}

function scrollToProfileHof() {
  document.getElementById('profile-hof-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export function MeterProfileHallOfFameBadge({ recordCount }: { recordCount: number }) {
  if (recordCount <= 0) return null

  const label = recordCount === 1 ? 'Record break' : 'Record breaks'

  return (
    <button
      type="button"
      className="meter-profile-hof-badge"
      onClick={scrollToProfileHof}
      title={`${recordCount} Hall of Fame ${label.toLowerCase()} — view chronicle`}
    >
      <span className="meter-profile-hof-badge__crest" aria-hidden>
        <HallOfFameCrestIcon />
        <span className="meter-profile-hof-badge__crest-ring" />
      </span>
      <span className="meter-profile-hof-badge__body">
        <span className="meter-profile-hof-badge__eyebrow">Hall of Fame</span>
        <span className="meter-profile-hof-badge__count-row">
          <span className="meter-profile-hof-badge__count">{recordCount}</span>
          <span className="meter-profile-hof-badge__label">{label}</span>
        </span>
      </span>
    </button>
  )
}
