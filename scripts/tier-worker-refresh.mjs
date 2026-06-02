/**
 * Headless worker: sign in to Odyssey Calc and open Tier List to publish fresh tier_list_live.
 *
 * Required env vars:
 * - TIER_WORKER_EMAIL
 * - TIER_WORKER_PASSWORD
 * - VITE_SUPABASE_URL (or SUPABASE_URL)
 * - VITE_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY)
 *
 * Optional:
 * - TIER_WORKER_SITE_ORIGIN (default: https://odyssey-calc.com)
 * - TIER_WORKER_TIMEOUT_MS (default: 3600000 / 60m)
 * - TIER_WORKER_FORCE=1 — append ?forceRefresh=1 so tier list always rebuilds
 */
import process from 'node:process'
import { chromium } from 'playwright'

const siteOrigin = (process.env.TIER_WORKER_SITE_ORIGIN || 'https://odyssey-calc.com').replace(/\/$/, '')
const timeoutMs = Math.max(Number(process.env.TIER_WORKER_TIMEOUT_MS) || 3_600_000, 60_000)
const forceRefresh =
  process.env.TIER_WORKER_FORCE === '1' || process.env.TIER_WORKER_FORCE === 'true'
const tierListReturnTo = forceRefresh ? '/tier-list?forceRefresh=1' : '/tier-list'

const email = (process.env.TIER_WORKER_EMAIL || '').trim()
const password = (process.env.TIER_WORKER_PASSWORD || '').trim()
const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim().replace(/\/$/, '')
const anonKey = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim()

if (!email || !password || !supabaseUrl || !anonKey) {
  console.error('Missing worker env vars.')
  process.exit(1)
}

const restHeaders = {
  apikey: anonKey,
  Authorization: `Bearer ${anonKey}`,
}

async function readSnapshotUpdatedAt() {
  const url = new URL(`${supabaseUrl}/rest/v1/tier_list_live`)
  url.searchParams.set('select', 'updated_at')
  url.searchParams.set('singleton', 'eq.true')
  url.searchParams.set('limit', '1')

  const res = await fetch(url, { headers: restHeaders })
  if (!res.ok) {
    throw new Error(`Supabase REST ${res.status}: ${await res.text()}`)
  }
  const rows = await res.json()
  const updatedAt = rows[0]?.updated_at
  return updatedAt ? new Date(updatedAt).getTime() : 0
}

async function readLatestRecomputeRunAt() {
  const url = new URL(`${supabaseUrl}/rest/v1/tier_recompute_runs`)
  url.searchParams.set('select', 'created_at')
  url.searchParams.set('order', 'created_at.desc')
  url.searchParams.set('limit', '1')

  const res = await fetch(url, { headers: restHeaders })
  if (!res.ok) {
    return 0
  }
  const rows = await res.json()
  const createdAt = rows[0]?.created_at
  return createdAt ? new Date(createdAt).getTime() : 0
}

function formatElapsed(ms) {
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  return `${min}m ${sec % 60}s`
}

async function readPageBuildProgress(page) {
  try {
    const strong = await page.locator('.tier-shell-bar-main strong').first().textContent({
      timeout: 2_000,
    })
    const text = strong?.trim()
    if (text && /\d/.test(text)) return text
  } catch {
    /* page still loading */
  }
  return null
}

async function readPageWorkerState(page) {
  try {
    return await page.locator('[data-tier-worker-state]').first().getAttribute('data-tier-worker-state', {
      timeout: 2_000,
    })
  } catch {
    return null
  }
}

async function readPageStatusLine(page) {
  try {
    const banner = await page.locator('.tier-server-rebuild-banner').first().textContent({ timeout: 2_000 })
    if (banner?.trim()) return banner.trim().replace(/\s+/g, ' ')
  } catch {
    /* ignore */
  }
  try {
    const err = await page.locator('.tier-shell-error').first().textContent({ timeout: 1_000 })
    if (err?.trim()) return `Error: ${err.trim()}`
  } catch {
    /* ignore */
  }
  return null
}

async function logStatus(elapsedMs, page, beforeAt, beforeRecomputeAt) {
  const elapsed = formatElapsed(elapsedMs)
  const pageProgress = await readPageBuildProgress(page)
  const workerState = await readPageWorkerState(page)
  const statusLine = await readPageStatusLine(page)
  const url = page.url()

  if (pageProgress) {
    console.log(`[tier-worker] ${elapsed} — page build ${pageProgress} (state=${workerState ?? '?'})`)
    return
  }
  if (statusLine) {
    console.log(`[tier-worker] ${elapsed} — ${statusLine} (state=${workerState ?? '?'})`)
    return
  }
  const afterAt = await readSnapshotUpdatedAt()
  if (afterAt > beforeAt) {
    console.log(`[tier-worker] ${elapsed} — snapshot published`)
    return
  }
  const recomputeAt = await readLatestRecomputeRunAt()
  if (recomputeAt > beforeRecomputeAt) {
    console.log(`[tier-worker] ${elapsed} — tier_recompute_runs row recorded`)
    return
  }
  console.log(`[tier-worker] ${elapsed} — waiting (state=${workerState ?? '?'}, url=${url})`)
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

const beforeAt = await readSnapshotUpdatedAt()
const beforeRecomputeAt = await readLatestRecomputeRunAt()
console.log(
  '[tier-worker] snapshot before:',
  beforeAt ? new Date(beforeAt).toISOString() : 'none',
)
console.log('[tier-worker] site:', siteOrigin, forceRefresh ? '(force refresh)' : '')

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext()
const page = await ctx.newPage()

page.on('console', (msg) => {
  const type = msg.type()
  if (type === 'error' || type === 'warning') {
    console.log(`[tier-worker][page-${type}]`, msg.text())
  }
})
page.on('pageerror', (err) => {
  console.error('[tier-worker][page-error]', err.message)
})

try {
  const returnTo = encodeURIComponent(tierListReturnTo)
  const authUrl = `${siteOrigin}/#/auth?returnTo=${returnTo}`
  console.log('[tier-worker] signing in…')
  await page.goto(authUrl, { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in to Odyssey Calc' }).click()

  await page.waitForURL(/#\/tier-list/, { timeout: 120_000 })
  if (forceRefresh && !page.url().includes('forceRefresh=1')) {
    await page.goto(`${siteOrigin}/#${tierListReturnTo}`, { waitUntil: 'domcontentloaded' })
  }
  console.log('[tier-worker] on tier list:', page.url())

  const start = Date.now()
  let lastLogAt = 0
  while (Date.now() - start < timeoutMs) {
    const afterAt = await readSnapshotUpdatedAt()
    const recomputeAt = await readLatestRecomputeRunAt()
    if (afterAt > beforeAt || recomputeAt > beforeRecomputeAt) {
      console.log('[tier-worker] done —', {
        snapshotUpdated: afterAt > beforeAt ? new Date(afterAt).toISOString() : null,
        recomputeRecorded: recomputeAt > beforeRecomputeAt ? new Date(recomputeAt).toISOString() : null,
      })
      process.exitCode = 0
      break
    }

    const elapsed = Date.now() - start
    if (elapsed - lastLogAt >= 15_000) {
      await logStatus(elapsed, page, beforeAt, beforeRecomputeAt)
      lastLogAt = elapsed
    }
    await sleep(5_000)
  }

  if (process.exitCode !== 0) {
    const workerState = await readPageWorkerState(page)
    const statusLine = await readPageStatusLine(page)
    console.error('[tier-worker] final page url:', page.url())
    console.error('[tier-worker] final worker state:', workerState)
    if (statusLine) console.error('[tier-worker] final status:', statusLine)
    throw new Error('Timed out waiting for tier_list_live to update.')
  }
} finally {
  await ctx.close()
  await browser.close()
}
