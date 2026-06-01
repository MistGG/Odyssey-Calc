export type GuidebookShareMeta = {
  sectionId: string
  title: string
  description: string
  panels: {
    badge: string
    name: string
    difficulty: string
    locationFilename?: string
  }[]
}

const SHARE_SECTIONS: Record<string, GuidebookShareMeta> = {
  'early-50-70': {
    sectionId: 'early-50-70',
    title: 'Level 50 & 70 uncap',
    description:
      "Agumon's Madness and The Rise of the Fallen Angel locations for the level 50 and 70 uncap. Odyssey Calc Guidebook",
    panels: [
      {
        badge: 'Level 50 uncap',
        name: "Agumon's Madness",
        difficulty: 'Normal',
        locationFilename: 'agumons-madness-location.png',
      },
      {
        badge: 'Level 70 uncap',
        name: 'The Rise of the Fallen Angel',
        difficulty: 'Normal',
        locationFilename: 'fallen-angel-location.png',
      },
    ],
  },
  'early-70-beyond': {
    sectionId: 'early-70-beyond',
    title: 'EXP farming',
    description:
      'The Dark Roar and The Undying (Story) for fast EXP after your level 70 uncap. Odyssey Calc Guidebook',
    panels: [
      {
        badge: 'EXP farm',
        name: 'The Dark Roar',
        difficulty: 'Story',
        locationFilename: 'dark-roar-location.png',
      },
      {
        badge: 'EXP farm',
        name: 'The Undying',
        difficulty: 'Story',
        locationFilename: 'the-undying-location.png',
      },
    ],
  },
}

export function getGuidebookShareMeta(sectionId: string): GuidebookShareMeta | null {
  return SHARE_SECTIONS[sectionId] ?? null
}

export function guidebookShareSectionIds(): string[] {
  return Object.keys(SHARE_SECTIONS)
}

export function guidebookHasSharePage(sectionId: string): boolean {
  return sectionId in SHARE_SECTIONS
}

/** App deep link (hash router). */
export function guidebookAppSectionHash(sectionId: string): string {
  return `/guidebook?step=${encodeURIComponent(sectionId)}`
}

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

/** Path to static share HTML (crawler-friendly; always at /share/... on localhost). */
export function guidebookSharePagePath(sectionId: string): string | null {
  if (!guidebookHasSharePage(sectionId)) return null

  if (typeof window !== 'undefined' && isLocalHostname(window.location.hostname)) {
    return `/share/guidebook/${encodeURIComponent(sectionId)}/`
  }

  const base = import.meta.env.BASE_URL || '/'
  const root = base.endsWith('/') ? base : `${base}/`
  return `${root}share/guidebook/${encodeURIComponent(sectionId)}/`
}

/**
 * Full share URL for copy/paste (Discord Open Graph).
 * On localhost, always uses port 5173 and /share/... (no /Odyssey-Calc/).
 */
export function guidebookSharePageUrl(sectionId: string): string | null {
  const path = guidebookSharePagePath(sectionId)
  if (!path) return null

  if (typeof window === 'undefined') return path

  const { hostname, protocol, port } = window.location
  if (isLocalHostname(hostname)) {
    const devPort = port === '4173' ? '5173' : port || '5173'
    return `${protocol}//${hostname}:${devPort}${path}`
  }

  return new URL(path, window.location.origin).href
}

/** Prefer share URL when available; otherwise fall back to hash deep link. */
export function guidebookSectionUrl(sectionId: string): string {
  const share = guidebookSharePageUrl(sectionId)
  if (share) return share
  const path = guidebookAppSectionHash(sectionId)
  if (typeof window === 'undefined') return path
  const base = window.location.href.split('#')[0]
  return `${base}#${path}`
}
