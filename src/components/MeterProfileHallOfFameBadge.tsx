import { Link } from 'react-router-dom'

export type MeterProfileHofBadgeVariant = 'olympus' | 'magia'

function HallOfFameCrestIcon({ variant }: { variant: MeterProfileHofBadgeVariant }) {
  if (variant === 'magia') {
    return (
      <svg
        className="meter-profile-hof-badge__crest-svg"
        viewBox="0 0 48 48"
        width={40}
        height={40}
        aria-hidden
      >
        <defs>
          <linearGradient id="magia-crest-frame" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e9d5ff" />
            <stop offset="45%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#6d28d9" />
          </linearGradient>
          <linearGradient id="magia-crest-core" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#2e1065" />
            <stop offset="100%" stopColor="#120818" />
          </linearGradient>
          <filter id="magia-crest-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="1.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path
          d="M24 2 L42 12 V28 L24 46 L6 28 V12 Z"
          fill="url(#magia-crest-frame)"
          opacity={0.95}
        />
        <path
          d="M24 6 L38 14 V26 L24 40 L10 26 V14 Z"
          fill="url(#magia-crest-core)"
          stroke="rgba(196, 181, 253, 0.5)"
          strokeWidth={0.75}
        />
        <path
          d="M24 10 L28 18 L36 18 L30 23 L32 31 L24 26 L16 31 L18 23 L12 18 L20 18 Z"
          fill="none"
          stroke="url(#magia-crest-frame)"
          strokeWidth={1.25}
          filter="url(#magia-crest-glow)"
        />
        <circle cx={24} cy={22} r={3.5} fill="#c4b5fd" opacity={0.95} />
        <path
          d="M24 8 v3 M24 34 v3 M10 22 h3 M35 22 h3"
          stroke="#ddd6fe"
          strokeWidth={1}
          strokeLinecap="round"
          opacity={0.55}
        />
      </svg>
    )
  }

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

type MeterProfileHallOfFameBadgeProps = {
  recordCount: number
  variant?: MeterProfileHofBadgeVariant
  cycleShortLabel: string
  /** When set, badge links to HoF for that cycle instead of scrolling the profile list. */
  hallOfFameCycleId?: string
  scrollToRecordBreaks?: boolean
}

function badgeCopy(variant: MeterProfileHofBadgeVariant, recordCount: number) {
  const label = recordCount === 1 ? 'Record break' : 'Record breaks'
  const eyebrow = variant === 'magia' ? 'Magia Cycle' : 'Olympus Cycle'
  return { label, eyebrow }
}

function BadgeInner({
  variant,
  recordCount,
}: {
  variant: MeterProfileHofBadgeVariant
  recordCount: number
}) {
  const { label, eyebrow } = badgeCopy(variant, recordCount)
  return (
    <>
      <span className="meter-profile-hof-badge__crest" aria-hidden>
        <HallOfFameCrestIcon variant={variant} />
        <span className="meter-profile-hof-badge__crest-ring" />
      </span>
      <span className="meter-profile-hof-badge__body">
        <span className="meter-profile-hof-badge__eyebrow">{eyebrow}</span>
        <span className="meter-profile-hof-badge__count-row">
          <span className="meter-profile-hof-badge__count">{recordCount}</span>
          <span className="meter-profile-hof-badge__label">{label}</span>
        </span>
      </span>
    </>
  )
}

export function MeterProfileHallOfFameBadge({
  recordCount,
  variant = 'olympus',
  cycleShortLabel,
  hallOfFameCycleId,
  scrollToRecordBreaks = false,
}: MeterProfileHallOfFameBadgeProps) {
  if (recordCount <= 0) return null

  const { label } = badgeCopy(variant, recordCount)
  const className = `meter-profile-hof-badge${variant === 'magia' ? ' meter-profile-hof-badge--magia' : ''}`
  const title = `${recordCount} ${cycleShortLabel} ${label.toLowerCase()}`

  if (hallOfFameCycleId) {
    return (
      <Link
        to={`/meter/hall-of-fame?cycle=${encodeURIComponent(hallOfFameCycleId)}`}
        className={className}
        title={`${title} — view in Hall of Fame`}
      >
        <BadgeInner variant={variant} recordCount={recordCount} />
      </Link>
    )
  }

  if (scrollToRecordBreaks) {
    return (
      <button type="button" className={className} onClick={scrollToProfileHof} title={`${title} — view chronicle`}>
        <BadgeInner variant={variant} recordCount={recordCount} />
      </button>
    )
  }

  return (
    <div className={`${className} meter-profile-hof-badge--static`} title={title}>
      <BadgeInner variant={variant} recordCount={recordCount} />
    </div>
  )
}
