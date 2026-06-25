import { resolveAppSiteOrigin } from '../config/site'

export const MAY_CLEAR_EVENT_SHARE_ID = 'exa-clear'

function siteBase(): string {
  const origin = resolveAppSiteOrigin().replace(/\/$/, '')
  const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')
  return `${origin}${base.startsWith('/') ? base : `/${base}`}`
}

/** Crawlable URL for Discord (not the hash route). */
export function mayClearEventSharePageUrl(): string {
  return `${siteBase()}share/event/${MAY_CLEAR_EVENT_SHARE_ID}/`
}
