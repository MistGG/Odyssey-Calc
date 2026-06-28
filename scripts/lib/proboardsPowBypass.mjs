const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/** @typedef {{ challenge_nonce: string, challenge_hmac: string, difficulty: string, difficulty_char: string, issued_at: string, cookie_duration?: string, cookie_domain?: string }} PowChallengeData */

/** @param {string} html */
export function parsePowChallengeData(html) {
  const m = html.match(/window\.POW_CHALLENGE_DATA\s*=\s*(\{[\s\S]*?\});/)
  if (!m?.[1]) return null
  const jsonish = m[1]
    .replace(/(\w+)\s*:/g, '"$1":')
    .replace(/'/g, '"')
  try {
    return /** @type {PowChallengeData} */ (JSON.parse(jsonish))
  } catch {
    return null
  }
}

/** @param {string} text */
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** @param {PowChallengeData} data */
export async function solveProboardsPow(data) {
  const prefix = data.difficulty_char.repeat(Number(data.difficulty))
  for (let i = 1; i < 10_000_000; i++) {
    const u = String(i)
    const hash = await sha256Hex(`${data.challenge_nonce}${data.issued_at}${u}`)
    if (hash.startsWith(prefix)) {
      return { counter: u, hash }
    }
  }
  throw new Error('ProBoards POW challenge was not solved within iteration budget')
}

/** @param {PowChallengeData} data @param {{ counter: string, hash: string }} solved */
export function buildPowBypassCookie(data, solved) {
  const value = [
    data.challenge_nonce,
    data.issued_at,
    solved.counter,
    solved.hash,
    data.challenge_hmac,
  ].join('|')
  const domain = data.cookie_domain ?? '.proboards.com'
  const maxAge = data.cookie_duration ?? '3600'
  return `pow_bypass=${value}; Domain=${domain.replace(/^\./, '')}; Path=/; Max-Age=${maxAge}`
}

/**
 * Fetch a ProBoards page, solving the POW challenge when present.
 * @param {string} url
 * @param {{ userAgent?: string, signal?: AbortSignal }} [opts]
 */
export async function fetchProboardsPage(url, opts = {}) {
  const userAgent = opts.userAgent ?? DEFAULT_USER_AGENT
  const headers = { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' }

  const first = await fetch(url, { headers, redirect: 'follow', signal: opts.signal })
  const firstHtml = await first.text()
  const challenge = parsePowChallengeData(firstHtml)
  if (!challenge) {
    return { html: firstHtml, status: first.status, usedPowBypass: false }
  }

  const solved = await solveProboardsPow(challenge)
  const cookieHeader = `pow_bypass=${[
    challenge.challenge_nonce,
    challenge.issued_at,
    solved.counter,
    solved.hash,
    challenge.challenge_hmac,
  ].join('|')}`

  const second = await fetch(url, {
    headers: { ...headers, Cookie: cookieHeader },
    redirect: 'follow',
    signal: opts.signal,
  })
  const secondHtml = await second.text()
  return { html: secondHtml, status: second.status, usedPowBypass: true }
}

export { DEFAULT_USER_AGENT as PROBOARDS_USER_AGENT }
