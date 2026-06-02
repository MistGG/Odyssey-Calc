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
 * - TIER_WORKER_TIMEOUT_MS (default: 1200000 / 20m)
 * - TIER_WORKER_FORCE=1 — append ?forceRefresh=1 so tier list always rebuilds
 */
import process from 'node:process'
import { chromium } from 'playwright'

const siteOrigin = (process.env.TIER_WORKER_SITE_ORIGIN || 'https://odyssey-calc.com').replace(/\/$/, '')
const timeoutMs = Math.max(Number(process.env.TIER_WORKER_TIMEOUT_MS) || 1_200_000, 60_000)
const forceRefresh =
  process.env.TIER_WORKER_FORCE === '1' || process.env.TIER_WORKER_FORCE === 'true'
const tierListPath = forceRefresh ? '/#/tier-list?forceRefresh=1' : '/#/tier-list'

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

async function readLiveRow() {
  const url = new URL(`${supabaseUrl}/rest/v1/tier_list_live`)
  url.searchParams.set(
    'select',
    'updated_at,rebuilding_at,rebuild_done,rebuild_total',
  )
  url.searchParams.set('singleton', 'eq.true')
  url.searchParams.set('limit', '1')

  const res = await fetch(url, { headers: restHeaders })
  if (!res.ok) {
    throw new Error(`Supabase REST ${res.status}: ${await res.text()}`)
  }
  const rows = await res.json()
  return rows[0] ?? null
}

function formatElapsed(ms) {
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  return `${min}m ${sec % 60}s`
}

function logProgress(elapsedMs, row, beforeAt) {
  const elapsed = formatElapsed(elapsedMs)
  const rebuildingAt = row?.rebuilding_at ? new Date(row.rebuilding_at).getTime() : 0
  const rebuildActive =
    Number.isFinite(rebuildingAt) && rebuildingAt > 0 && Date.now() - rebuildingAt < 2 * 60 * 60 * 1000

  if (rebuildActive) {
    const done = Number(row?.rebuild_done) || 0
    const total = Number(row?.rebuild_total) || 0
    const pct = total > 0 ? ((done / total) * 100).toFixed(1) : '…'
    console.log(`[tier-worker] ${elapsed} — rebuild ${done}/${total} (${pct}%)`)
    return
  }

  const updatedAt = row?.updated_at ? new Date(row.updated_at).getTime() : 0
  if (updatedAt > beforeAt) {
    console.log(`[tier-worker] ${elapsed} — snapshot published`)
    return
  }

  console.log(`[tier-worker] ${elapsed} — waiting for browser rebuild to start or finish…`)
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

const beforeRow = await readLiveRow()
const beforeAt = beforeRow?.updated_at ? new Date(beforeRow.updated_at).getTime() : 0
console.log(
  '[tier-worker] snapshot before:',
  beforeAt ? new Date(beforeAt).toISOString() : 'none',
)

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext()
const page = await ctx.newPage()

try {
  const authUrl = `${siteOrigin}/#/auth?returnTo=%2Ftier-list`
  await page.goto(authUrl, { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in to Odyssey Calc' }).click()

  await page.waitForURL(/#\/tier-list/, { timeout: 60_000 })
  await page.goto(`${siteOrigin}${tierListPath}`, { waitUntil: 'domcontentloaded' })
  if (forceRefresh) console.log('[tier-worker] force refresh requested')

  const start = Date.now()
  let lastLogAt = 0
  while (Date.now() - start < timeoutMs) {
    const row = await readLiveRow()
    const afterAt = row?.updated_at ? new Date(row.updated_at).getTime() : 0
    const rebuildingAt = row?.rebuilding_at ? new Date(row.rebuilding_at).getTime() : 0
    const rebuildActive =
      Number.isFinite(rebuildingAt) &&
      rebuildingAt > 0 &&
      Date.now() - rebuildingAt < 2 * 60 * 60 * 1000

    const elapsed = Date.now() - start
    if (elapsed - lastLogAt >= 15_000) {
      logProgress(elapsed, row, beforeAt)
      lastLogAt = elapsed
    }

    if (afterAt > beforeAt && !rebuildActive) {
      console.log('[tier-worker] done — snapshot updated:', new Date(afterAt).toISOString())
      process.exitCode = 0
      break
    }
    await sleep(5_000)
  }

  if (process.exitCode !== 0) {
    throw new Error('Timed out waiting for tier_list_live to update.')
  }
} finally {
  await ctx.close()
  await browser.close()
}
