/**
 * Copy meter profile share HTML + OG images from Supabase storage into public/
 * as flat files (mist.html, mist-og.png) so GitHub Pages serves them for Discord OG.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const BUCKET = 'meter-profile-shares'
const outRoot = path.join(root, 'public', 'share', 'meter-player')
const SITE_ORIGIN = (process.env.VITE_SITE_ORIGIN || 'https://mistgg.github.io/Odyssey-Calc').replace(
  /\/$/,
  '',
)
const BASE_PATH = (process.env.VITE_BASE_PATH || '/Odyssey-Calc/').replace(/\/?$/, '/')

const supabaseUrl = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || ''
const isCi = process.env.GITHUB_ACTIONS === 'true' || process.env.CI === 'true'

if (!supabaseUrl || !anonKey) {
  const msg = '[sync-meter-profile-shares] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY'
  if (isCi) {
    console.error(msg)
    process.exit(1)
  }
  console.log(`${msg} — skipping local build`)
  process.exit(0)
}

async function listPlayerKeysFromTable() {
  const res = await fetch(`${supabaseUrl}/rest/v1/meter_profile_shares?select=player_key`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.warn(`[sync-meter-profile-shares] Table list failed (${res.status}): ${body.slice(0, 200)}`)
    return []
  }
  const rows = await res.json()
  if (!Array.isArray(rows)) return []
  return rows.map((r) => r.player_key).filter((k) => typeof k === 'string' && k.trim())
}

async function listPlayerKeysFromStorage() {
  const res = await fetch(`${supabaseUrl}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefix: '', limit: 1000, offset: 0 }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.warn(`[sync-meter-profile-shares] Storage list failed (${res.status}): ${body.slice(0, 200)}`)
    return []
  }
  const rows = await res.json()
  if (!Array.isArray(rows)) return []
  const keys = new Set()
  for (const row of rows) {
    const name = row?.name
    if (typeof name !== 'string') continue
    const slash = name.indexOf('/')
    if (slash > 0) keys.add(name.slice(0, slash).toLowerCase())
  }
  return [...keys]
}

async function downloadPublicObject(playerKey, filename) {
  const folder = encodeURIComponent(playerKey.trim().toLowerCase())
  const url = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${folder}/${filename}`
  const res = await fetch(url)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`${filename} for ${playerKey}: HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

function rewriteHtmlForGithubPages(html, playerKey) {
  const key = playerKey.trim().toLowerCase()
  const enc = encodeURIComponent(key)
  const pagePath = `${BASE_PATH}share/meter-player/${enc}.html`
  const ogPath = `${BASE_PATH}share/meter-player/${enc}-og.png`
  const pageUrl = `${SITE_ORIGIN}${pagePath.startsWith('/') ? pagePath : `/${pagePath}`}`
  const ogUrl = `${SITE_ORIGIN}${ogPath.startsWith('/') ? ogPath : `/${ogPath}`}`

  let out = html.toString('utf8')
  out = out.replace(
    new RegExp(`${BASE_PATH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}share/meter-player/${enc}/og\\.png`, 'g'),
    ogPath,
  )
  out = out.replace(
    new RegExp(`${SITE_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${BASE_PATH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}share/meter-player/${enc}/og\\.png`, 'g'),
    ogUrl,
  )
  out = out.replace(
    new RegExp(`${BASE_PATH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}share/meter-player/${enc}/`, 'g'),
    pagePath,
  )
  out = out.replace(
    new RegExp(`${SITE_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${BASE_PATH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}share/meter-player/${enc}/`, 'g'),
    pageUrl,
  )
  return out
}

async function main() {
  const fromTable = await listPlayerKeysFromTable()
  const fromStorage = await listPlayerKeysFromStorage()
  const keys = [...new Set([...fromTable, ...fromStorage].map((k) => k.trim().toLowerCase()))].filter(Boolean)

  if (keys.length === 0) {
    const msg = '[sync-meter-profile-shares] No player shares found in table or storage'
    if (isCi) {
      console.error(msg)
      process.exit(1)
    }
    console.log(msg)
    return
  }

  fs.mkdirSync(outRoot, { recursive: true })

  let synced = 0
  for (const key of keys) {
    const html = await downloadPublicObject(key, 'index.html')
    const og = await downloadPublicObject(key, 'og.png')
    if (!html && !og) {
      console.warn(`[sync-meter-profile-shares] No files in storage for ${key}`)
      continue
    }

    if (html) {
      const rewritten = rewriteHtmlForGithubPages(html, key)
      fs.writeFileSync(path.join(outRoot, `${key}.html`), rewritten)
    }
    if (og) {
      fs.writeFileSync(path.join(outRoot, `${key}-og.png`), og)
    }
    synced += 1
    console.log(`[sync-meter-profile-shares] ${key}.html${og ? ` + ${key}-og.png` : ''}`)
  }

  if (synced === 0) {
    const msg = '[sync-meter-profile-shares] Found keys but could not download any share files'
    if (isCi) {
      console.error(msg)
      process.exit(1)
    }
    console.log(msg)
    return
  }

  console.log(`[sync-meter-profile-shares] Synced ${synced} profile(s) to public/share/meter-player/`)
}

main().catch((e) => {
  console.error('[sync-meter-profile-shares]', e)
  process.exit(1)
})
