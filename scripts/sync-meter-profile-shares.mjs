/**
 * Copy meter profile share HTML + OG images from Supabase storage into public/
 * so GitHub Pages can serve Discord links without exposing the Supabase project URL.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const BUCKET = 'meter-profile-shares'
const outRoot = path.join(root, 'public', 'share', 'meter-player')

const supabaseUrl = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !anonKey) {
  console.log('[sync-meter-profile-shares] Skipping (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set)')
  process.exit(0)
}

async function listPlayerKeys() {
  const res = await fetch(`${supabaseUrl}/rest/v1/meter_profile_shares?select=player_key`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) {
    console.warn(`[sync-meter-profile-shares] Could not list shares (${res.status})`)
    return []
  }
  const rows = await res.json()
  if (!Array.isArray(rows)) return []
  return rows.map((r) => r.player_key).filter((k) => typeof k === 'string' && k.trim())
}

async function downloadPublicObject(playerKey, filename) {
  const folder = encodeURIComponent(playerKey.trim().toLowerCase())
  const url = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${folder}/${filename}`
  const res = await fetch(url)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`${filename} for ${playerKey}: HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function main() {
  const keys = await listPlayerKeys()
  if (keys.length === 0) {
    console.log('[sync-meter-profile-shares] No shares in database')
    return
  }

  let synced = 0
  for (const key of keys) {
    const dir = path.join(outRoot, key)
    const html = await downloadPublicObject(key, 'index.html')
    const og = await downloadPublicObject(key, 'og.png')
    if (!html && !og) continue

    fs.mkdirSync(dir, { recursive: true })
    if (html) fs.writeFileSync(path.join(dir, 'index.html'), html)
    if (og) fs.writeFileSync(path.join(dir, 'og.png'), og)
    synced += 1
  }

  console.log(`[sync-meter-profile-shares] Synced ${synced} profile(s) to public/share/meter-player/`)
}

main().catch((e) => {
  console.error('[sync-meter-profile-shares]', e)
  process.exit(1)
})
