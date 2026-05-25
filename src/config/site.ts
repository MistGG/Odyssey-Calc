/** Public app URL (hash-router SPA). */
export const DEFAULT_APP_SITE_ORIGIN = 'https://odyssey-calc.com'

/** Discord meter share pages (Cloudflare Worker). */
export const DEFAULT_METER_SHARE_PUBLIC_ORIGIN = 'https://share.odyssey-calc.com'

/** Baked at build time; in the browser uses current origin + base. */
export function resolveAppSiteOrigin(): string {
  if (typeof window !== 'undefined') {
    const base = import.meta.env.BASE_URL || '/'
    const root = base.endsWith('/') && base.length > 1 ? base.slice(0, -1) : base === '/' ? '' : base
    return `${window.location.origin}${root}`.replace(/\/$/, '')
  }
  const fromEnv = (import.meta.env.VITE_SITE_ORIGIN as string | undefined)?.trim()
  return (fromEnv || DEFAULT_APP_SITE_ORIGIN).replace(/\/$/, '')
}
