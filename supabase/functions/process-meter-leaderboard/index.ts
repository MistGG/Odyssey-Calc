import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { syncPointGrantsAfterUpload } from './pointGrants.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ROLE_BUCKETS = ['melee', 'ranged', 'caster', 'hybrid', 'tank', 'healer'] as const
type RoleBucket = (typeof ROLE_BUCKETS)[number]

const MIN_PARTY_DAMAGE_SHARE = 0.02
const PARTY_UPLOAD_DEDUPE_WINDOW_SEC = 10
const WIKI_DIGIMON_DETAIL_URL =
  Deno.env.get('WIKI_DIGIMON_DETAIL_URL')?.trim() ||
  'https://odyssey-proxy.qawsar-ahmed.workers.dev/proxy/api/wiki/digimon'
const WIKI_DIGIMON_LIST_URL =
  Deno.env.get('WIKI_DIGIMON_LIST_URL')?.trim() ||
  'https://odyssey-proxy.qawsar-ahmed.workers.dev/proxy/api/wiki/digimon'

const WIKI_CATALOG_TTL_MS = 60 * 60 * 1000
let wikiRoleCatalog: Map<string, RoleBucket | null> | null = null
let wikiRoleCatalogLoadedAt = 0

type SummaryMember = {
  playerKey?: string
  displayName?: string
  dps?: number
  digimonId?: string
  digimonName?: string
  iconId?: string | null
  portraitUrl?: string
  roleBucket?: RoleBucket | null
}

type LeaderboardSummary = {
  version?: number
  eligible?: boolean
  sessionDurationSec?: number
  members?: SummaryMember[]
  invalidateReason?: string
}

type StoredMember = {
  memberKey?: string
  displayLabel?: string
  tamerName?: string
  totalDamage?: number
  durationSec?: number
  currentDigimonId?: string | null
  currentDigimonName?: string | null
  portraitIconId?: string | null
  portraitUrl?: string
  digimons?: Array<{
    digimonId?: string
    digimonName?: string
    iconId?: string | null
    portraitUrl?: string
    totalDamage?: number
    skills?: Array<{ skillKey?: string; skill?: string; damage?: number; hits?: number }>
  }>
}

type DungeonPayload = {
  schemaVersion?: number
  kind?: string
  sessionDurationSec?: number
  raidTotalDamage?: number
  dungeon?: {
    leaderboardEligible?: boolean
    runOutcome?: string | null
  }
  members?: StoredMember[]
}

type ParseRow = {
  id: string
  user_id?: string | null
  created_at: string
  duration_sec: number
  dungeon_id: string | null
  difficulty_id: number | null
  app_version?: string | null
  payload: unknown
  leaderboard_summary: LeaderboardSummary | null
}

type ProcessOptions = {
  force?: boolean
  /** Set when merging a duplicate party upload onto the first parse in the window. */
  skipDuplicateCheck?: boolean
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalizeWikiRole(role: string | null | undefined): string {
  return (role ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function wikiRoleToBucket(role: string | null | undefined): RoleBucket | null {
  const norm = normalizeWikiRole(role)
  if (norm === 'melee dps') return 'melee'
  if (norm === 'ranged dps') return 'ranged'
  if (norm === 'caster') return 'caster'
  if (norm === 'hybrid') return 'hybrid'
  if (norm === 'tank') return 'tank'
  if (norm === 'support') return 'healer'
  return null
}

const DPS_ROLE_BUCKETS: RoleBucket[] = ['melee', 'ranged', 'caster', 'hybrid']

function isDpsRoleBucket(bucket: RoleBucket | null | undefined): boolean {
  return bucket != null && DPS_ROLE_BUCKETS.includes(bucket)
}

function memberHasDpsAndNonDpsDamage(
  totals: Map<string, number>,
  wikiCatalog: Map<string, RoleBucket | null>,
): boolean {
  let hasDps = false
  let hasNonDps = false
  for (const [id, damage] of totals) {
    if (damage <= 0) continue
    const bucket = wikiCatalog.get(id) ?? null
    if (!bucket) continue
    if (isDpsRoleBucket(bucket)) hasDps = true
    else hasNonDps = true
    if (hasDps && hasNonDps) return true
  }
  return false
}

function normalizePlayerKey(member: StoredMember): string {
  const raw = member.tamerName?.trim() || member.displayLabel?.trim() || ''
  return raw.toLowerCase()
}

function buildPartyRunFingerprint(
  dungeonId: string,
  difficultyId: number,
  durationSec: number,
  members: StoredMember[],
): string {
  const players = members
    .map((m) => normalizePlayerKey(m))
    .filter(Boolean)
    .sort()
  const dur = Math.max(0, Math.round(durationSec))
  return `${dungeonId.trim()}:${difficultyId}:${dur}:${players.join('\u0001')}`
}

async function findDuplicatePartyParseInWindow(
  supabase: ReturnType<typeof createClient>,
  fingerprint: string,
  excludeParseId: string,
): Promise<string | null> {
  const since = new Date(Date.now() - PARTY_UPLOAD_DEDUPE_WINDOW_SEC * 1000).toISOString()
  const { data, error } = await supabase
    .from('meter_parses')
    .select('id')
    .eq('parse_kind', 'dungeon_party')
    .eq('party_fingerprint', fingerprint)
    .neq('id', excludeParseId)
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error || !data?.id) return null
  return data.id as string
}

function memberDigimons(member: StoredMember) {
  if (member.digimons?.length) return member.digimons
  const id = member.currentDigimonId?.trim() || 'unknown'
  return [
    {
      digimonId: id,
      digimonName: member.currentDigimonName?.trim() || member.displayLabel?.trim() || '',
      iconId: member.portraitIconId?.trim() || null,
      portraitUrl: member.portraitUrl,
      totalDamage: member.totalDamage ?? 0,
    },
  ]
}

function memberDamageTotal(member: StoredMember): number {
  const digimons = memberDigimons(member)
  const sum = digimons.reduce((s, d) => s + Math.max(0, Number(d.totalDamage) || 0), 0)
  if (sum > 0) return Math.round(sum)
  return Math.round(Math.max(0, Number(member.totalDamage) || 0))
}

const JUSTIMON_SKILL_KEYS = new Set(['s17n1tnq', 'sxpj32p', 'sjf3ii7', 's1d4eddt'])
const JUSTIMON_SKILL_NAME = /^(accel arm|final justice|justice kick|justice impact field|agent alpha)$/i

function isJustimonSkill(skillKey: string, skillName: string): boolean {
  const key = skillKey.trim().toLowerCase()
  if (JUSTIMON_SKILL_KEYS.has(key)) return true
  return JUSTIMON_SKILL_NAME.test(skillName.trim())
}

/** Justimon skills logged under another digimon id (e.g. Toy Agumon roster slot). */
function reconcileJustimonMisattribution(member: StoredMember): void {
  const digimons = member.digimons
  if (!digimons?.length) return

  let justimonSkillDmg = 0
  for (const dg of digimons) {
    for (const s of dg.skills ?? []) {
      if (isJustimonSkill(String(s.skillKey ?? ''), String(s.skill ?? ''))) {
        justimonSkillDmg += Math.max(0, Number(s.damage) || 0)
      }
    }
  }
  if (justimonSkillDmg <= 0) return

  const justimonId = 'djwfsba'
  const storedJustimonDmg = digimons
    .filter((d) => (d.digimonId?.trim() ?? '') === justimonId)
    .reduce((s, d) => s + Math.max(0, Number(d.totalDamage) || 0), 0)
  if (justimonSkillDmg <= storedJustimonDmg + 1000) return

  const justimonSkills = digimons.flatMap((d) =>
    (d.skills ?? []).filter((s) =>
      isJustimonSkill(String(s.skillKey ?? ''), String(s.skill ?? '')),
    ),
  )
  const autoSkills = digimons.flatMap((d) =>
    (d.skills ?? []).filter((s) => /auto attack|\(basic\)/i.test(String(s.skill ?? ''))),
  )
  const justimonTotal =
    justimonSkills.reduce((s, sk) => s + Math.max(0, Number(sk.damage) || 0), 0) +
    autoSkills.reduce((s, sk) => s + Math.max(0, Number(sk.damage) || 0), 0)

  const otherRows: NonNullable<StoredMember['digimons']> = []
  for (const d of digimons) {
    const id = d.digimonId?.trim() ?? ''
    if (id === justimonId) continue
    const remSkills = (d.skills ?? []).filter(
      (s) => !isJustimonSkill(String(s.skillKey ?? ''), String(s.skill ?? '')),
    )
    const remDmg = remSkills.reduce((s, sk) => s + Math.max(0, Number(sk.damage) || 0), 0)
    if (remDmg <= 0) continue
    otherRows.push({
      ...d,
      skills: remSkills,
      totalDamage: Math.round(remDmg),
    })
  }

  member.digimons = [
    {
      digimonId: justimonId,
      digimonName: 'Justimon',
      iconId: digimons.find((d) => d.digimonId?.trim() === justimonId)?.iconId ?? null,
      portraitUrl: digimons.find((d) => d.digimonId?.trim() === justimonId)?.portraitUrl,
      totalDamage: Math.round(justimonTotal),
      skills: [...justimonSkills, ...autoSkills],
    },
    ...otherRows,
  ].filter((d) => Math.max(0, Number(d.totalDamage) || 0) > 0)
}

function sessionDuration(payload: DungeonPayload, rowDurationSec: number, members: StoredMember[]): number {
  const fromPayload = Number(payload.sessionDurationSec)
  if (Number.isFinite(fromPayload) && fromPayload > 0) return fromPayload
  const rowDur = Number(rowDurationSec)
  if (Number.isFinite(rowDur) && rowDur > 0) return rowDur
  return Math.max(...members.map((m) => Math.max(0, Number(m.durationSec) || 0)), 0)
}

function memberDps(
  member: StoredMember,
  payload: DungeonPayload,
  rowDurationSec: number,
  members: StoredMember[],
): number {
  const damage = memberDamageTotal(member)
  const dur = Math.max(sessionDuration(payload, rowDurationSec, members), Number(member.durationSec) || 0, 1e-6)
  return dur > 0 ? damage / dur : 0
}

/** Digimon with the highest damage this run (any role, including same-role end-of-run swaps). */
function memberPrimaryDigimon(
  member: StoredMember,
  wikiCatalog?: Map<string, RoleBucket | null>,
) {
  reconcileJustimonMisattribution(member)
  const digimons = memberDigimons(member)
  const totals = new Map<string, number>()
  const rowsById = new Map<string, (typeof digimons)[number]>()
  for (const dg of digimons) {
    const id = dg.digimonId?.trim() ?? ''
    if (!id) continue
    const damage = Math.max(0, Number(dg.totalDamage) || 0)
    totals.set(id, (totals.get(id) ?? 0) + damage)
    const prev = rowsById.get(id)
    if (!prev || damage > Math.max(0, Number(prev.totalDamage) || 0)) rowsById.set(id, dg)
  }

  if (wikiCatalog && memberHasDpsAndNonDpsDamage(totals, wikiCatalog)) {
    let bestDpsId: string | null = null
    let bestDpsDamage = -1
    for (const [id, damage] of totals) {
      if (!isDpsRoleBucket(wikiCatalog.get(id) ?? null)) continue
      if (damage > bestDpsDamage) {
        bestDpsDamage = damage
        bestDpsId = id
      }
    }
    if (bestDpsId) return rowsById.get(bestDpsId)
  }

  let bestId: string | null = null
  let bestDamage = -1
  for (const [id, damage] of totals) {
    if (damage > bestDamage) {
      bestDamage = damage
      bestId = id
    }
  }
  return bestId ? rowsById.get(bestId) : undefined
}

function primaryDigimonDamage(
  member: StoredMember,
  wikiCatalog?: Map<string, RoleBucket | null>,
): number {
  const digimons = memberDigimons(member)
  if (digimons.length <= 1) return memberDamageTotal(member)
  const totals = new Map<string, number>()
  for (const dg of digimons) {
    const id = dg.digimonId?.trim() ?? ''
    if (!id) continue
    totals.set(id, (totals.get(id) ?? 0) + Math.max(0, Number(dg.totalDamage) || 0))
  }
  if (totals.size <= 1) return memberDamageTotal(member)
  if (wikiCatalog && memberHasDpsAndNonDpsDamage(totals, wikiCatalog)) {
    return memberDamageTotal(member)
  }
  const primary = memberPrimaryDigimon(member, wikiCatalog)
  if (!primary) return memberDamageTotal(member)
  const dmg = Math.max(0, totals.get(primary.digimonId?.trim() ?? '') ?? 0)
  return dmg > 0 ? dmg : memberDamageTotal(member)
}

function memberDpsForLeaderboard(
  member: StoredMember,
  payload: DungeonPayload,
  rowDurationSec: number,
  members: StoredMember[],
  wikiCatalog?: Map<string, RoleBucket | null>,
): number {
  reconcileJustimonMisattribution(member)
  const digimons = memberDigimons(member)
  const damage =
    digimons.length > 1 ? primaryDigimonDamage(member, wikiCatalog) : memberDamageTotal(member)
  const dur = Math.max(sessionDuration(payload, rowDurationSec, members), Number(member.durationSec) || 0, 1e-6)
  return dur > 0 ? damage / dur : 0
}

function isBrokenPartyParse(payload: DungeonPayload, members: StoredMember[]): boolean {
  if (members.length < 2) return false
  if (members.some((m) => memberDigimons(m).length === 0)) return true
  const damages = members.map((m) => memberDamageTotal(m))
  const sumMember = damages.reduce((s, d) => s + d, 0)
  const raidTotal = Math.max(Number(payload.raidTotalDamage) || 0, sumMember, 1)
  const maxDmg = Math.max(0, ...damages)
  if (maxDmg <= 0) return false
  if (damages.some((d) => d / raidTotal < MIN_PARTY_DAMAGE_SHARE)) return true
  const nearZeroCount = damages.filter((d) => d < raidTotal * 0.02).length
  const nonzeroCount = damages.filter((d) => d >= raidTotal * 0.02).length
  if (nonzeroCount <= 1 && maxDmg >= raidTotal * 0.88) return true
  if (maxDmg >= raidTotal * 0.9 && nearZeroCount >= members.length - 1) return true
  return false
}

const MEMBER_SPIKE_MAX_ACTIVE_SEC = 3
const MEMBER_SPIKE_MIN_SESSION_OVERHANG_SEC = 5
/** Ranked dungeon clears shorter than this are rejected (reset-mid-run tail damage, etc.). */
const MIN_LEADERBOARD_SESSION_SEC = 10

function bossTargetLooksLikeFinalDungeonBoss(name: string): boolean {
  return /<\s*dungeon\s+boss\s*>/i.test(name)
}

function isPartialDungeonClear(payload: DungeonPayload, _rowDurationSec: number): boolean {
  const dungeon = payload.dungeon
  if (!dungeon) return false
  if (dungeon.leaderboardEligible === true) return false
  if (dungeon.leaderboardEligible === false) return false
  if (dungeon.runOutcome !== 'clear') return false
  const bosses = Array.isArray(dungeon.bossTargets)
    ? dungeon.bossTargets.filter((b): b is string => typeof b === 'string')
    : []
  const hasFinalBoss = bosses.some((b) => bossTargetLooksLikeFinalDungeonBoss(b))
  if (bosses.length >= 2 && !hasFinalBoss) return true
  return false
}

function isMemberLeaderboardEligible(
  member: StoredMember,
  sessionDur: number,
  dungeonLeaderboardEligible?: boolean,
): boolean {
  const raw = member as Record<string, unknown>
  if (raw.leaderboardEligible === false) return false
  if (raw.died === true || raw.isDead === true || raw.deathBeforeClear === true) return false
  if (dungeonLeaderboardEligible === true) return true
  const memberDur = Math.max(Number(member.durationSec) || 0, 0)
  if (
    memberDur > 0 &&
    memberDur < MEMBER_SPIKE_MAX_ACTIVE_SEC &&
    sessionDur > memberDur + MEMBER_SPIKE_MIN_SESSION_OVERHANG_SEC
  ) {
    return false
  }
  return true
}

function isLeaderboardEligiblePayload(payload: DungeonPayload): boolean {
  const d = payload.dungeon
  if (!d) return false
  if (typeof d.leaderboardEligible === 'boolean') return d.leaderboardEligible
  return d.runOutcome === 'clear'
}

/** Full wiki catalog (same source as the website) — avoids flaky per-id lookups in Edge. */
async function loadWikiRoleCatalog(): Promise<Map<string, RoleBucket | null>> {
  if (wikiRoleCatalog && Date.now() - wikiRoleCatalogLoadedAt < WIKI_CATALOG_TTL_MS) {
    return wikiRoleCatalog
  }

  const map = new Map<string, RoleBucket | null>()
  let page = 1
  let totalPages = 1

  while (page <= totalPages) {
    const join = WIKI_DIGIMON_LIST_URL.includes('?') ? '&' : '?'
    const url = `${WIKI_DIGIMON_LIST_URL}${join}page=${page}&per_page=500`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) break
    const raw = (await res.json()) as {
      data?: Array<{ id?: string; role?: string }>
      total_pages?: number
    }
    totalPages = Math.max(1, Number(raw.total_pages) || 1)
    for (const d of raw.data ?? []) {
      const id = String(d.id ?? '').trim()
      if (!id) continue
      map.set(id, wikiRoleToBucket(typeof d.role === 'string' ? d.role : null))
    }
    page += 1
  }

  if (map.size > 0) {
    wikiRoleCatalog = map
    wikiRoleCatalogLoadedAt = Date.now()
  }
  return map
}

async function fetchWikiDigimon(digimonId: string): Promise<{ name: string | null; role: string | null }> {
  const id = digimonId.trim()
  if (!id || id === 'unknown') return { name: null, role: null }
  try {
    const join = WIKI_DIGIMON_DETAIL_URL.includes('?') ? '&' : '?'
    const url = `${WIKI_DIGIMON_DETAIL_URL}${join}id=${encodeURIComponent(id)}`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return { name: null, role: null }
    const raw = (await res.json()) as { role?: unknown; name?: unknown }
    const role = typeof raw.role === 'string' ? raw.role.trim() : ''
    const name = typeof raw.name === 'string' ? raw.name.trim() : ''
    return { name: name || null, role: role || null }
  } catch {
    return { name: null, role: null }
  }
}

async function resolveRoleBucket(
  member: StoredMember,
  _summaryMember: SummaryMember | undefined,
  roleCache: Map<string, RoleBucket | null>,
  wikiCatalog: Map<string, RoleBucket | null>,
): Promise<RoleBucket | null> {
  const primary = memberPrimaryDigimon(member, wikiCatalog)
  const digimonId = primary?.digimonId?.trim() || ''
  if (!digimonId) return null

  if (roleCache.has(digimonId)) return roleCache.get(digimonId) ?? null

  const fromCatalog = wikiCatalog.get(digimonId)
  if (fromCatalog) {
    roleCache.set(digimonId, fromCatalog)
    return fromCatalog
  }

  const wiki = await fetchWikiDigimon(digimonId)
  const bucket = wikiRoleToBucket(wiki.role)
  roleCache.set(digimonId, bucket)
  return bucket
}

async function buildSummaryFromPayload(
  payload: DungeonPayload,
  rowDurationSec: number,
  wikiCatalog: Map<string, RoleBucket | null>,
): Promise<LeaderboardSummary | null> {
  if (payload.kind !== 'dungeon_party' || !Array.isArray(payload.members)) return null
  if (!isLeaderboardEligiblePayload(payload)) return { version: 1, eligible: false, members: [] }
  if (isPartialDungeonClear(payload, rowDurationSec)) {
    return { version: 1, eligible: false, members: [] }
  }
  const members = payload.members
  if (isBrokenPartyParse(payload, members)) return { version: 1, eligible: false, members: [] }

  const sessionDur = sessionDuration(payload, rowDurationSec, members)
  if (sessionDur < MIN_LEADERBOARD_SESSION_SEC) {
    return {
      version: 1,
      eligible: false,
      sessionDurationSec: sessionDur,
      members: [],
      invalidateReason: `session_under_${MIN_LEADERBOARD_SESSION_SEC}s_v3`,
    }
  }
  const dungeonLeaderboardEligible = payload.dungeon?.leaderboardEligible === true
  const out: SummaryMember[] = []
  for (const member of members) {
    if (!isMemberLeaderboardEligible(member, sessionDur, dungeonLeaderboardEligible)) continue
    const primary = memberPrimaryDigimon(member, wikiCatalog)
    const dps = memberDpsForLeaderboard(member, payload, rowDurationSec, members, wikiCatalog)
    const digimonId = primary?.digimonId?.trim() || ''
    out.push({
      playerKey: normalizePlayerKey(member),
      displayName: member.tamerName?.trim() || member.displayLabel?.trim() || '',
      dps,
      digimonId,
      digimonName: primary?.digimonName?.trim() || '',
      iconId: primary?.iconId?.trim() || null,
      portraitUrl: primary?.portraitUrl,
      roleBucket: digimonId ? (wikiCatalog.get(digimonId) ?? null) : null,
    })
  }
  return {
    version: 1,
    eligible: true,
    sessionDurationSec: sessionDuration(payload, rowDurationSec, members),
    members: out,
  }
}

async function countResolvableMembers(
  memberList: StoredMember[],
  summaryByKey: Map<string, SummaryMember>,
  wikiCatalog: Map<string, RoleBucket | null>,
): Promise<number> {
  const roleCache = new Map<string, RoleBucket | null>()
  let n = 0
  for (const member of memberList) {
    const playerKey = normalizePlayerKey(member)
    if (!playerKey) continue
    const sm = summaryByKey.get(playerKey)
    const dps = sm?.dps ?? 0
    if (!(dps > 0)) continue
    const bucket = await resolveRoleBucket(member, sm, roleCache, wikiCatalog)
    if (bucket) n += 1
  }
  return n
}

async function processParse(
  row: ParseRow,
  supabase: ReturnType<typeof createClient>,
  options: ProcessOptions = {},
): Promise<{ inserted: number; skipped: string | null }> {
  const dungeonId = row.dungeon_id?.trim() ?? ''
  const difficultyId = row.difficulty_id
  if (!dungeonId || difficultyId == null || difficultyId < 2) {
    return { inserted: 0, skipped: 'missing dungeon scope' }
  }

  const force = options.force === true
  if (force) {
    await supabase.from('meter_leaderboard_entries').delete().eq('parse_id', row.id)
    await supabase.rpc('rebuild_meter_hof_gold_for_scope', {
      p_dungeon_id: dungeonId,
      p_difficulty_id: difficultyId,
    })
  }

  const { data: existingRows, error: existingError } = await supabase
    .from('meter_leaderboard_entries')
    .select('player_key')
    .eq('parse_id', row.id)
  if (existingError) throw new Error(existingError.message)
  const existingPlayerKeys = new Set(
    (existingRows ?? []).map((r) => String(r.player_key ?? '').trim().toLowerCase()).filter(Boolean),
  )

  const payload = (row.payload ?? {}) as DungeonPayload
  const members = payload.members ?? []
  const durationSec = sessionDuration(payload, Number(row.duration_sec) || 0, members)
  const fingerprint =
    members.length > 0
      ? buildPartyRunFingerprint(dungeonId, difficultyId, durationSec, members)
      : null

  if (fingerprint && !force && !options.skipDuplicateCheck) {
    const dupId = await findDuplicatePartyParseInWindow(supabase, fingerprint, row.id)
    if (dupId) {
      await supabase.from('meter_parses').update({ party_fingerprint: fingerprint }).eq('id', row.id)
      const { data: canonical, error: canonicalError } = await supabase
        .from('meter_parses')
        .select(
          'id, user_id, created_at, duration_sec, dungeon_id, difficulty_id, app_version, payload, leaderboard_summary',
        )
        .eq('id', dupId)
        .maybeSingle()
      if (canonicalError) throw new Error(canonicalError.message)
      if (!canonical) {
        return { inserted: 0, skipped: 'duplicate party upload within window' }
      }
      const mergedRow: ParseRow = {
        ...(canonical as ParseRow),
        payload: row.payload ?? canonical.payload,
        leaderboard_summary: row.leaderboard_summary ?? canonical.leaderboard_summary,
        duration_sec: row.duration_sec ?? canonical.duration_sec,
      }
      const merged = await processParse(mergedRow, supabase, {
        ...options,
        skipDuplicateCheck: true,
      })
      return {
        ...merged,
        skipped: merged.inserted > 0 ? null : merged.skipped ?? 'duplicate party upload within window',
      }
    }
    await supabase.from('meter_parses').update({ party_fingerprint: fingerprint }).eq('id', row.id)
  } else if (fingerprint) {
    await supabase.from('meter_parses').update({ party_fingerprint: fingerprint }).eq('id', row.id)
  }

  if (isPartialDungeonClear(payload, Number(row.duration_sec) || 0)) {
    return { inserted: 0, skipped: 'partial dungeon clear' }
  }

  let summary = row.leaderboard_summary
  const wikiCatalog = await loadWikiRoleCatalog()
  if (!summary?.members?.length) {
    summary = await buildSummaryFromPayload(payload, Number(row.duration_sec) || 0, wikiCatalog)
  }

  if (!summary?.eligible) return { inserted: 0, skipped: 'not leaderboard eligible' }

  if (members.length && isBrokenPartyParse(payload, members)) {
    return { inserted: 0, skipped: 'broken party parse' }
  }

  const summaryByKey = new Map<string, SummaryMember>()
  for (const sm of summary.members ?? []) {
    const key = (sm.playerKey ?? '').trim().toLowerCase()
    if (key) summaryByKey.set(key, sm)
  }

  const memberList = members.length
    ? members
    : (summary.members ?? []).map((sm) => ({
        tamerName: sm.displayName,
        displayLabel: sm.displayName,
        digimons: [
          {
            digimonId: sm.digimonId,
            digimonName: sm.digimonName,
            iconId: sm.iconId,
            portraitUrl: sm.portraitUrl,
            totalDamage: 0,
          },
        ],
      }))

  if (!force && existingPlayerKeys.size > 0) {
    const expected = await countResolvableMembers(memberList, summaryByKey, wikiCatalog)
    if (expected > 0 && existingPlayerKeys.size >= expected) {
      return { inserted: 0, skipped: 'already processed' }
    }
  }

  const roleCache = new Map<string, RoleBucket | null>()
  const nameCache = new Map<string, string | null>()
  const entries: Array<Record<string, unknown>> = []
  const enrichedByPlayerKey = new Map<
    string,
    { digimonName: string; iconId: string | null; portraitUrl: string | null }
  >()

  const sessionDur = sessionDuration(payload, Number(row.duration_sec) || 0, members)
  const dungeonLeaderboardEligible = payload.dungeon?.leaderboardEligible === true
  for (const member of memberList) {
    if (!isMemberLeaderboardEligible(member, sessionDur, dungeonLeaderboardEligible)) continue
    const playerKey = normalizePlayerKey(member)
    if (!playerKey || existingPlayerKeys.has(playerKey)) continue
    const sm = summaryByKey.get(playerKey)
    const roleBucket = await resolveRoleBucket(member, sm, roleCache, wikiCatalog)
    if (!roleBucket) continue

    const primary = memberPrimaryDigimon(member, wikiCatalog)
    const digimonId = primary?.digimonId?.trim() || ''
    let officialName: string | null = null
    if (digimonId) {
      if (nameCache.has(digimonId)) {
        officialName = nameCache.get(digimonId) ?? null
      } else {
        const wiki = await fetchWikiDigimon(digimonId)
        officialName = wiki.name
        nameCache.set(digimonId, officialName)
        if (!roleCache.has(digimonId) && wiki.role) {
          roleCache.set(digimonId, wikiRoleToBucket(wiki.role))
        }
      }
    }

    const dps = memberDpsForLeaderboard(
      member,
      payload,
      Number(row.duration_sec) || 0,
      memberList,
      wikiCatalog,
    )
    if (!(dps > 0)) continue

    entries.push({
      parse_id: row.id,
      created_at: row.created_at,
      dungeon_id: dungeonId,
      difficulty_id: difficultyId,
      role_bucket: roleBucket,
      player_key: playerKey,
      display_name:
        sm?.displayName?.trim() ||
        member.tamerName?.trim() ||
        member.displayLabel?.trim() ||
        playerKey,
      dps,
      digimon_id: digimonId,
      digimon_name: officialName || '',
      icon_id: sm?.iconId?.trim() || primary?.iconId?.trim() || null,
      portrait_url: sm?.portraitUrl?.trim() || primary?.portraitUrl || null,
    })
    enrichedByPlayerKey.set(playerKey, {
      digimonName: officialName || sm?.digimonName?.trim() || primary?.digimonName?.trim() || '',
      iconId: sm?.iconId?.trim() || primary?.iconId?.trim() || null,
      portraitUrl: sm?.portraitUrl?.trim() || primary?.portraitUrl || null,
    })
  }

  if (!entries.length) {
    return {
      inserted: 0,
      skipped: existingPlayerKeys.size > 0 ? 'already processed' : 'no entries with role bucket',
    }
  }

  const { error } = await supabase.from('meter_leaderboard_entries').upsert(entries, {
    onConflict: 'parse_id,player_key',
    ignoreDuplicates: false,
  })
  if (error) throw new Error(error.message)

  const filledSummary: LeaderboardSummary = {
    ...summary,
    version: 1,
    members: (summary.members ?? []).map((sm) => {
      const key = (sm.playerKey ?? '').trim().toLowerCase()
      const member = memberList.find((m) => normalizePlayerKey(m) === key)
      const digimonId =
        sm.digimonId?.trim() ||
        (member ? memberPrimaryDigimon(member, wikiCatalog)?.digimonId?.trim() : '') ||
        ''
      const enriched = enrichedByPlayerKey.get(key)
      return {
        ...sm,
        digimonId: digimonId || sm.digimonId,
        digimonName: enriched?.digimonName || sm.digimonName,
        iconId: enriched?.iconId ?? sm.iconId ?? null,
        portraitUrl: enriched?.portraitUrl || sm.portraitUrl,
        roleBucket: sm.roleBucket ?? roleCache.get(digimonId) ?? wikiCatalog.get(digimonId) ?? null,
      }
    }),
  }

  await supabase.from('meter_parses').update({ leaderboard_summary: filledSummary }).eq('id', row.id)

  let grantsInserted = 0
  const userId = row.user_id?.trim()
  if (userId) {
    try {
      const grantResult = await syncPointGrantsAfterUpload(supabase, userId, {
        ...row,
        leaderboard_summary: filledSummary,
      })
      grantsInserted = grantResult.inserted
    } catch {
      /* non-fatal — shop visit can still sync grants */
    }
  }

  return { inserted: entries.length, skipped: null, grants_inserted: grantsInserted }
}

async function fetchBackfillStatus(supabase: ReturnType<typeof createClient>) {
  const [remainingRes, entriesRes] = await Promise.all([
    supabase.rpc('count_meter_parses_needing_leaderboard_backfill'),
    supabase.from('meter_leaderboard_entries').select('*', { count: 'exact', head: true }),
  ])
  return {
    remaining: remainingRes.error ? null : Number(remainingRes.data ?? 0),
    total_entries: entriesRes.error ? null : Number(entriesRes.count ?? 0),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed.' })

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (!serviceKey) return json(500, { ok: false, error: 'Missing service role key.' })

  let body: {
    parse_id?: string
    parseId?: string
    backfill_limit?: number
    status_only?: boolean
    force?: boolean
  } = {}
  try {
    body = await req.json()
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON body.' })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey)
  const force = body.force === true

  if (body.status_only) {
    const status = await fetchBackfillStatus(supabase)
    return json(200, { ok: true, status: true, ...status })
  }

  if (body.backfill_limit && body.backfill_limit > 0) {
    const limit = Math.min(Math.floor(body.backfill_limit), 500)
    const statusBefore = await fetchBackfillStatus(supabase)

    const { data: parseIds, error: idsError } = await supabase.rpc(
      'get_meter_parses_for_leaderboard_backfill',
      { p_limit: limit },
    )
    if (idsError) return json(500, { ok: false, error: idsError.message })

    const ids = (parseIds ?? []) as string[]
    if (!ids.length) {
      const statusAfter = await fetchBackfillStatus(supabase)
      return json(200, {
        ok: true,
        backfill: true,
        processed: 0,
        inserted: 0,
        skipped: 0,
        errors: [],
        ...statusAfter,
      })
    }

    const { data, error } = await supabase
      .from('meter_parses')
      .select(
        'id, user_id, created_at, duration_sec, dungeon_id, difficulty_id, app_version, payload, leaderboard_summary',
      )
      .in('id', ids)

    if (error) return json(500, { ok: false, error: error.message })

    let inserted = 0
    let skipped = 0
    const errors: string[] = []
    for (const row of (data ?? []) as ParseRow[]) {
      try {
        const result = await processParse(row, supabase, { force })
        inserted += result.inserted
        if (result.inserted === 0) skipped += 1
      } catch (e) {
        errors.push(`${row.id}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    const statusAfter = await fetchBackfillStatus(supabase)
    return json(200, {
      ok: true,
      backfill: true,
      processed: data?.length ?? 0,
      inserted,
      skipped,
      errors,
      remaining_before: statusBefore.remaining,
      remaining: statusAfter.remaining,
      total_entries: statusAfter.total_entries,
    })
  }

  const parseId = (body.parse_id ?? body.parseId)?.trim()
  if (!parseId) return json(400, { ok: false, error: 'parse_id is required.' })

  if (!force) {
    const { count, error: countError } = await supabase
      .from('meter_leaderboard_entries')
      .select('*', { count: 'exact', head: true })
      .eq('parse_id', parseId)
    if (!countError && (count ?? 0) > 0) {
      return json(200, { ok: true, inserted: 0, skipped: 'already processed' })
    }
  }

  const { data, error } = await supabase
    .from('meter_parses')
    .select(
      'id, user_id, created_at, duration_sec, dungeon_id, difficulty_id, app_version, payload, leaderboard_summary',
    )
    .eq('id', parseId)
    .maybeSingle()

  if (error) return json(500, { ok: false, error: error.message })
  if (!data) return json(404, { ok: false, error: 'Parse not found.' })

  try {
    const result = await processParse(data as ParseRow, supabase, { force })
    return json(200, { ok: true, ...result })
  } catch (e) {
    return json(500, { ok: false, error: e instanceof Error ? e.message : String(e) })
  }
})
