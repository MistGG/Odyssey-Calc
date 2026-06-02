import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const WIKI_DIGIMON_LIST_URL =
  Deno.env.get('WIKI_DIGIMON_LIST_URL')?.trim() ||
  'https://odyssey-proxy.qawsar-ahmed.workers.dev/proxy/api/wiki/digimon'

type WikiDigimonListItem = {
  id?: string
  name?: string
  model_id?: string
  stage?: string
  attribute?: string
  element?: string
  role?: string
  family_types?: string[]
  rank?: number
  hp?: number
  attack?: number
}

type WikiDigimonListResponse = {
  data?: WikiDigimonListItem[]
  total_pages?: number
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function listSignature(d: WikiDigimonListItem): string {
  return [
    d.id ?? '',
    d.name ?? '',
    d.model_id ?? '',
    d.stage ?? '',
    d.attribute ?? '',
    d.element ?? '',
    d.role ?? '',
    Array.isArray(d.family_types) ? d.family_types.join(',') : '',
    Number(d.rank ?? 0),
    Number(d.hp ?? 0),
    Number(d.attack ?? 0),
  ].join('|')
}

function toUrl(page: number, perPage = 500): string {
  const join = WIKI_DIGIMON_LIST_URL.includes('?') ? '&' : '?'
  return `${WIKI_DIGIMON_LIST_URL}${join}page=${page}&per_page=${perPage}`
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function fetchAllDigimon(): Promise<WikiDigimonListItem[]> {
  const all: WikiDigimonListItem[] = []
  let page = 1
  let totalPages = 1
  while (page <= totalPages) {
    const res = await fetch(toUrl(page), { headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`Wiki API failed (${res.status}) on page ${page}.`)
    const raw = (await res.json()) as WikiDigimonListResponse
    const rows = Array.isArray(raw.data) ? raw.data : []
    all.push(...rows)
    totalPages = Math.max(1, Number(raw.total_pages) || 1)
    page += 1
  }
  return all
}

function buildDiffs(
  prev: Record<string, string>,
  next: Record<string, string>,
  names: Record<string, string>,
): {
  added: string[]
  removed: string[]
  changed: string[]
  sampleDigimon: Array<{ id: string; name: string; cause: 'api' }>
  apiDiffs: Array<{ id: string; name: string; lines: string[] }>
} {
  const added: string[] = []
  const removed: string[] = []
  const changed: string[] = []

  for (const id of Object.keys(next)) {
    if (!(id in prev)) added.push(id)
    else if (prev[id] !== next[id]) changed.push(id)
  }
  for (const id of Object.keys(prev)) {
    if (!(id in next)) removed.push(id)
  }

  const sampleDigimon: Array<{ id: string; name: string; cause: 'api' }> = []
  const apiDiffs: Array<{ id: string; name: string; lines: string[] }> = []
  for (const id of [...added, ...changed, ...removed].slice(0, 120)) {
    const name = names[id] || id
    sampleDigimon.push({ id, name, cause: 'api' })
    const lines =
      added.includes(id)
        ? ['Digimon added in API index.']
        : removed.includes(id)
          ? ['Digimon removed from API index.']
          : ['Digimon index metadata changed.']
    apiDiffs.push({ id, name, lines })
  }
  return { added, removed, changed, sampleDigimon, apiDiffs }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed.' })

  const syncKey = Deno.env.get('TIER_SYNC_CRON_KEY')?.trim()
  if (syncKey) {
    const provided = req.headers.get('x-sync-key')?.trim()
    if (!provided || provided !== syncKey) return json(401, { ok: false, error: 'Unauthorized.' })
  }

  const url = Deno.env.get('SUPABASE_URL')?.trim() || ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() || ''
  if (!url || !serviceKey) return json(500, { ok: false, error: 'Missing Supabase env vars.' })
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } })

  try {
    const all = await fetchAllDigimon()
    const signatures: Record<string, string> = {}
    const names: Record<string, string> = {}
    for (const d of all) {
      const id = String(d.id ?? '').trim()
      if (!id) continue
      signatures[id] = listSignature(d)
      names[id] = String(d.name ?? '').trim() || id
    }

    const signatureBlob = Object.keys(signatures)
      .sort((a, b) => a.localeCompare(b))
      .map((id) => `${id}:${signatures[id]}`)
      .join('\n')
    const signaturesHash = await sha256Hex(signatureBlob)

    const { data: stateRow } = await sb
      .from('tier_sync_state')
      .select('signatures, signatures_hash')
      .eq('singleton', true)
      .maybeSingle()

    const prevSignatures =
      stateRow && stateRow.signatures && typeof stateRow.signatures === 'object'
        ? (stateRow.signatures as Record<string, string>)
        : {}
    const prevHash =
      stateRow && typeof stateRow.signatures_hash === 'string' ? stateRow.signatures_hash : ''

    const diff = buildDiffs(prevSignatures, signatures, names)
    const changed = diff.added.length + diff.removed.length + diff.changed.length > 0

    await sb.from('tier_sync_state').upsert(
      {
        singleton: true,
        signatures,
        signatures_hash: signaturesHash,
        total_count: Object.keys(signatures).length,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'singleton' },
    )

    await sb.from('tier_sync_runs').insert({
      status: changed ? 'changed' : 'no_changes',
      total_count: Object.keys(signatures).length,
      added_count: diff.added.length,
      removed_count: diff.removed.length,
      changed_count: diff.changed.length,
      signatures_hash: signaturesHash,
      sample_digimon: diff.sampleDigimon.slice(0, 60),
      api_diffs: diff.apiDiffs.slice(0, 60),
      error_text: null,
    })

    return json(200, {
      ok: true,
      changed,
      previousHash: prevHash || null,
      signaturesHash,
      total: Object.keys(signatures).length,
      added: diff.added.length,
      removed: diff.removed.length,
      changedCount: diff.changed.length,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await sb.from('tier_sync_runs').insert({
      status: 'failed',
      error_text: msg,
      total_count: 0,
      added_count: 0,
      removed_count: 0,
      changed_count: 0,
    })
    return json(500, { ok: false, error: msg })
  }
})

