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

async function readSnapshotUpdatedAt() {
  const url = new URL(`${supabaseUrl}/rest/v1/tier_list_live`)
  url.searchParams.set('select', 'updated_at')
  url.searchParams.set('singleton', 'eq.true')
  url.searchParams.set('limit', '1')

  const res = await fetch(url, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  })
  if (!res.ok) {
    throw new Error(`Supabase REST ${res.status}: ${await res.text()}`)
  }
  const rows = await res.json()
  const updatedAt = rows[0]?.updated_at
  return updatedAt ? new Date(updatedAt).getTime() : 0
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

const beforeAt = await readSnapshotUpdatedAt()
console.log('[tier-worker] snapshot before:', beforeAt || 'none')

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
  while (Date.now() - start < timeoutMs) {
    const afterAt = await readSnapshotUpdatedAt()
    if (afterAt > beforeAt) {
      console.log('[tier-worker] snapshot updated:', new Date(afterAt).toISOString())
      process.exitCode = 0
      break
    }
    await sleep(15_000)
  }

  if (process.exitCode !== 0) {
    throw new Error('Timed out waiting for tier_list_live to update.')
  }
} finally {
  await ctx.close()
  await browser.close()
}
