/**
 * Headless worker: sign in to Odyssey Calc, run a tier list rebuild, export static JSON
 * for GitHub Pages (no Supabase tier_list_live / tier_sync writes).
 *
 * Required env vars:
 * - TIER_WORKER_EMAIL
 * - TIER_WORKER_PASSWORD
 *
 * Auth uses the live site's Supabase client (baked into the Pages build); this script
 * does not call Supabase REST or tier_list_live.
 *
 * Optional:
 * - TIER_WORKER_SITE_ORIGIN (default: https://odyssey-calc.com)
 * - TIER_WORKER_TIMEOUT_MS (default: 3600000 / 60m)
 * - TIER_WORKER_FORCE=1 — append ?forceRefresh=1 so tier list always rebuilds
 */
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { chromium } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tierListOut = resolve(root, 'public/data/tier-list-live.json')
const tierHistoryOut = resolve(root, 'public/data/tier-change-history.json')

const TIER_LIST_CACHE_KEY = 'odysseyCalc.tierList.v1'
const TIER_CHANGE_HISTORY_STORAGE_KEY = 'odysseyCalc.tierChangeHistory.v1'

const siteOrigin = (process.env.TIER_WORKER_SITE_ORIGIN || 'https://odyssey-calc.com').replace(/\/$/, '')
const timeoutMs = Math.max(Number(process.env.TIER_WORKER_TIMEOUT_MS) || 3_600_000, 60_000)
const forceRefresh =
  process.env.TIER_WORKER_FORCE === '1' || process.env.TIER_WORKER_FORCE === 'true'
const tierListReturnTo = forceRefresh ? '/tier-list?forceRefresh=1' : '/tier-list'

const email = (process.env.TIER_WORKER_EMAIL || '').trim()
const password = (process.env.TIER_WORKER_PASSWORD || '').trim()

if (!email || !password) {
  console.error('Missing TIER_WORKER_EMAIL or TIER_WORKER_PASSWORD.')
  process.exit(1)
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

async function logStatus(elapsedMs, page) {
  const elapsed = formatElapsed(elapsedMs)
  const pageProgress = await readPageBuildProgress(page)
  const workerState = await readPageWorkerState(page)
  const statusLine = await readPageStatusLine(page)

  if (pageProgress) {
    console.log(`[tier-worker] ${elapsed} — page build ${pageProgress} (state=${workerState ?? '?'})`)
    return
  }
  if (statusLine) {
    console.log(`[tier-worker] ${elapsed} — ${statusLine} (state=${workerState ?? '?'})`)
    return
  }
  console.log(`[tier-worker] ${elapsed} — waiting (state=${workerState ?? '?'})`)
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function isTierListCacheShape(value) {
  if (!value || typeof value !== 'object') return false
  const o = value
  return (
    typeof o.version === 'number' &&
    typeof o.total === 'number' &&
    Array.isArray(o.queue) &&
    !!o.entries &&
    typeof o.entries === 'object' &&
    !!o.listSignatures &&
    typeof o.listSignatures === 'object'
  )
}

async function readTierExports(page) {
  return page.evaluate(
    ({ listKey, historyKey }) => {
      let cache = null
      let runs = []
      try {
        const raw = localStorage.getItem(listKey)
        if (raw) cache = JSON.parse(raw)
      } catch {
        /* ignore */
      }
      try {
        const raw = localStorage.getItem(historyKey)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) runs = parsed
        }
      } catch {
        /* ignore */
      }
      return { cache, runs }
    },
    { listKey: TIER_LIST_CACHE_KEY, historyKey: TIER_CHANGE_HISTORY_STORAGE_KEY },
  )
}

function writePublishedFiles(cache, runs) {
  const updatedAt = new Date().toISOString()
  writeFileSync(
    tierListOut,
    `${JSON.stringify({ updated_at: updatedAt, cache }, null, 2)}\n`,
    'utf8',
  )
  writeFileSync(
    tierHistoryOut,
    `${JSON.stringify({ updated_at: updatedAt, runs }, null, 2)}\n`,
    'utf8',
  )
  console.log('[tier-worker] wrote', tierListOut)
  console.log('[tier-worker] wrote', tierHistoryOut, `(${runs.length} history runs)`)
}

console.log('[tier-worker] site:', siteOrigin, forceRefresh ? '(force refresh)' : '')
console.log('[tier-worker] publishing to static JSON (no Supabase tier tables)')

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
  let done = false

  while (Date.now() - start < timeoutMs) {
    const workerState = await readPageWorkerState(page)
    const statusLine = await readPageStatusLine(page)
    if (statusLine?.startsWith('Error:')) {
      throw new Error(statusLine)
    }

    if (workerState === 'ready') {
      const { cache, runs } = await readTierExports(page)
      if (isTierListCacheShape(cache) && Object.keys(cache.entries ?? {}).length > 0) {
        writePublishedFiles(cache, runs)
        done = true
        break
      }
    }

    const elapsed = Date.now() - start
    if (elapsed - lastLogAt >= 15_000) {
      await logStatus(elapsed, page)
      lastLogAt = elapsed
    }
    await sleep(5_000)
  }

  if (!done) {
    const workerState = await readPageWorkerState(page)
    const statusLine = await readPageStatusLine(page)
    console.error('[tier-worker] final page url:', page.url())
    console.error('[tier-worker] final worker state:', workerState)
    if (statusLine) console.error('[tier-worker] final status:', statusLine)
    throw new Error('Timed out waiting for tier list rebuild to finish.')
  }
} finally {
  await ctx.close()
  await browser.close()
}
