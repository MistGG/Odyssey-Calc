/**
 * Headless worker: open Odyssey Calc tier list with ?forceRefresh=1, run a rebuild,
 * export static JSON for GitHub Pages (no Supabase tier_list_live / tier_sync writes).
 *
 * Sign-in is not required — rebuild uses the wiki API + in-browser sim. Supabase is only
 * used for approved community rotations (best-effort; skipped when unavailable).
 *
 * Optional env vars:
 * - TIER_WORKER_SITE_ORIGIN (default: https://odyssey-calc.com)
 * - TIER_WORKER_TIMEOUT_MS (default: 3600000 / 60m)
 * - TIER_WORKER_FORCE=1 — append ?forceRefresh=1 so tier list always rebuilds
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { chromium } from 'playwright'
import {
  buildTierChangeHistoryRun,
  mergeTierChangeHistoryRuns,
} from './tier-change-summary.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tierListOut = resolve(root, 'public/data/tier-list-live.json')
const tierHistoryOut = resolve(root, 'public/data/tier-change-history.json')

const TIER_LIST_CACHE_KEY = 'odysseyCalc.tierList.v1'
const TIER_CHANGE_HISTORY_STORAGE_KEY = 'odysseyCalc.tierChangeHistory.v1'

const siteOrigin = (process.env.TIER_WORKER_SITE_ORIGIN || 'https://odyssey-calc.com').replace(/\/$/, '')
const timeoutMs = Math.max(Number(process.env.TIER_WORKER_TIMEOUT_MS) || 3_600_000, 60_000)
const forceRefresh =
  process.env.TIER_WORKER_FORCE === '1' || process.env.TIER_WORKER_FORCE === 'true'
const tierListPath = forceRefresh ? '/tier-list?forceRefresh=1' : '/tier-list'

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

function readPublishedTierSnapshot() {
  try {
    if (!existsSync(tierListOut)) return null
    const raw = JSON.parse(readFileSync(tierListOut, 'utf8'))
    if (!raw?.cache || typeof raw.updated_at !== 'string') return null
    return raw
  } catch {
    return null
  }
}

function readPublishedTierHistoryRuns() {
  try {
    if (!existsSync(tierHistoryOut)) return []
    const raw = JSON.parse(readFileSync(tierHistoryOut, 'utf8'))
    return Array.isArray(raw?.runs) ? raw.runs : []
  } catch {
    return []
  }
}

function writePublishedFiles(cache, priorSnapshot, priorHistoryRuns) {
  const updatedAt = new Date().toISOString()
  writeFileSync(
    tierListOut,
    `${JSON.stringify({ updated_at: updatedAt, cache }, null, 2)}\n`,
    'utf8',
  )

  let historyRuns = priorHistoryRuns
  if (isTierListCacheShape(cache)) {
    const priorCache = priorSnapshot?.cache ?? { entries: {}, listSignatures: {} }
    const newRun = buildTierChangeHistoryRun(priorCache, cache, 'force')
    historyRuns = mergeTierChangeHistoryRuns(newRun, priorHistoryRuns)
    const tierChanges =
      newRun.summary.dpsUp.length +
      newRun.summary.dpsDown.length +
      newRun.summary.dpsNew.length +
      newRun.summary.tankUp.length +
      newRun.summary.tankDown.length +
      newRun.summary.tankNew.length +
      newRun.summary.healerUp.length +
      newRun.summary.healerDown.length +
      newRun.summary.healerNew.length +
      newRun.summary.statusChanges.length
    console.log(
      `[tier-worker] history run: ${tierChanges} tier deltas, ${newRun.apiCount} api signature changes`,
    )
  }

  writeFileSync(
    tierHistoryOut,
    `${JSON.stringify({ updated_at: updatedAt, runs: historyRuns }, null, 2)}\n`,
    'utf8',
  )
  console.log('[tier-worker] wrote', tierListOut)
  console.log('[tier-worker] wrote', tierHistoryOut, `(${historyRuns.length} history runs)`)
}

function formatRestrictedResponse(status, url, bodyText) {
  let detail = bodyText?.trim() || '(empty body)'
  try {
    const parsed = JSON.parse(bodyText)
    if (parsed?.message) detail = parsed.message
    else if (parsed?.error_description) detail = parsed.error_description
    else if (parsed?.error) detail = parsed.error
  } catch {
    /* use raw text */
  }
  return `[tier-worker] HTTP ${status} from ${url}: ${detail}`
}

console.log('[tier-worker] site:', siteOrigin, forceRefresh ? '(force refresh)' : '')
console.log('[tier-worker] publishing to static JSON (no Supabase tier tables)')
console.log('[tier-worker] no sign-in required (wiki + in-browser sim)')

const priorPublishedSnapshot = readPublishedTierSnapshot()
const priorPublishedHistoryRuns = readPublishedTierHistoryRuns()
if (priorPublishedSnapshot?.cache) {
  console.log(
    '[tier-worker] prior snapshot:',
    priorPublishedSnapshot.updated_at,
    `(${Object.keys(priorPublishedSnapshot.cache.entries ?? {}).length} entries)`,
  )
}
console.log('[tier-worker] prior history runs on disk:', priorPublishedHistoryRuns.length)

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext()
const page = await ctx.newPage()

const restrictedResponses = []

page.on('response', async (response) => {
  const status = response.status()
  if (status !== 402 && status !== 403) return
  const url = response.url()
  if (!url.includes('supabase.co') && !url.includes('workers.dev')) return
  try {
    const body = await response.text()
    restrictedResponses.push(formatRestrictedResponse(status, url, body))
  } catch {
    restrictedResponses.push(formatRestrictedResponse(status, url, ''))
  }
})

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
  const tierUrl = `${siteOrigin}/#${tierListPath}`
  console.log('[tier-worker] opening tier list…', tierUrl)
  await page.goto(tierUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForURL(/#\/tier-list/, { timeout: 120_000 })
  console.log('[tier-worker] on tier list:', page.url())

  const start = Date.now()
  let lastLogAt = 0
  let done = false
  let sawBuilding = false

  while (Date.now() - start < timeoutMs) {
    const workerState = await readPageWorkerState(page)
    const statusLine = await readPageStatusLine(page)
    if (statusLine?.startsWith('Error:')) {
      throw new Error(statusLine)
    }

    if (workerState === 'building') {
      sawBuilding = true
    }

    if (workerState === 'ready') {
      const { cache, runs } = await readTierExports(page)
      if (isTierListCacheShape(cache) && Object.keys(cache.entries ?? {}).length > 0) {
        writePublishedFiles(cache, priorPublishedSnapshot, priorPublishedHistoryRuns)
        done = true
        break
      }
      if (forceRefresh && !sawBuilding) {
        throw new Error(
          'Tier list never entered building state. Check that forceRefresh=1 is enabled in the deployed app.',
        )
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

  if (restrictedResponses.length > 0) {
    console.warn('[tier-worker] Some upstream APIs returned quota/auth errors (rebuild may omit community rotations):')
    for (const line of restrictedResponses.slice(0, 5)) {
      console.warn(line)
    }
  }
} finally {
  await ctx.close()
  await browser.close()
}
