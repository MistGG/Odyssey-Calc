import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { syncPointGrantsAfterUpload } from './pointGrants.ts'
import { resolveEffectiveDigimonIdentity } from './alternateStructure.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ROLE_BUCKETS = ['melee', 'ranged', 'caster', 'hybrid', 'tank', 'healer'] as const
type RoleBucket = (typeof ROLE_BUCKETS)[number]

const MIN_PARTY_DAMAGE_SHARE = 0.02
/** How far apart party uploads of the same clear may be and still merge. */
const PARTY_UPLOAD_DEDUPE_WINDOW_SEC = 30 * 60
/** Meter duration drift (Mist 72s vs Tirweth 70s) still counts as one run. */
const PARTY_DURATION_TOLERANCE_SEC = 5
/**
 * In-game results-screen clear clocks for the same pull must match this closely.
 * Farming the same dungeon back-to-back often lands within a few seconds of meter
 * duration (e.g. 135s vs 136s) but different clear times (142s vs 144s).
 */
const PARTY_CLEAR_TIME_TOLERANCE_SEC = 1
/**
 * When both uploads have a clear clock, peer meters of one pull finish close together.
 * Longer gaps with an identical clear clock are almost always a later farm pull
 * (same party, same clear time by coincidence) — do not soft-merge those.
 */
const PARTY_UPLOAD_WITH_CLEAR_MAX_GAP_SEC = 4 * 60
/**
 * When either upload lacks clientComplete.timeSec, only treat near-simultaneous
 * uploads as the same clear (peer meters finish within seconds; multi-minute gaps
 * are almost always a later pull with a similar meter duration).
 */
const PARTY_UPLOAD_NO_CLEAR_MAX_GAP_SEC = 120
/**
 * Same meter user re-uploading one clear (retry): raid / per-member damage must
 * match this closely. Used only when both payloads share an isSelf player.
 */
const PARTY_REUPLOAD_RAID_REL_TOLERANCE = 0.02
const PARTY_REUPLOAD_MEMBER_REL_TOLERANCE = 0.05
/** When the in-game clear time and meter session diverge by at least this, DPS uses the in-game clock. */
const DPS_CLEAR_TIME_GAP_SEC = 30
const WIKI_DIGIMON_DETAIL_URL =
  Deno.env.get('WIKI_DIGIMON_DETAIL_URL')?.trim() ||
  'https://odyssey-proxy.qawsar-ahmed.workers.dev/proxy/api/wiki/digimon'
const WIKI_DIGIMON_LIST_URL =
  Deno.env.get('WIKI_DIGIMON_LIST_URL')?.trim() ||
  'https://odyssey-proxy.qawsar-ahmed.workers.dev/proxy/api/wiki/digimon'

const WIKI_CATALOG_TTL_MS = 60 * 60 * 1000
let wikiRoleCatalog: Map<string, RoleBucket | null> | null = null
let wikiMetaCatalog: Map<string, { name: string; modelId: string; role: string }> | null = null
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
  isSelf?: boolean
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
    clientComplete?: { timeSec?: number }
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
  if (norm === 'melee dps' || norm === 'melee') return 'melee'
  if (norm === 'ranged dps' || norm === 'ranged') return 'ranged'
  if (norm === 'caster') return 'caster'
  if (norm === 'hybrid') return 'hybrid'
  if (norm === 'tank') return 'tank'
  if (norm === 'support' || norm === 'healer') return 'healer'
  return null
}

function portraitUrlMatchesIcon(portraitUrl: string | null | undefined, iconId: string | null): boolean {
  const icon = iconId?.trim()
  if (!icon) return true
  const portrait = portraitUrl?.trim()
  if (!portrait) return false
  return portrait.includes(`/${icon}l.`) || portrait.includes(`/${icon}.`)
}

function portraitUrlForResolvedIcon(
  iconId: string | null,
  payloadPortrait: string | null | undefined,
): string | null {
  const icon = iconId?.trim()
  const payload = payloadPortrait?.trim()
  if (!icon) return payload || null
  if (portraitUrlMatchesIcon(payload, icon)) return payload || null
  return `https://thedigitalodyssey.com/models/${icon}l.png`
}

function normalizePlayerKey(member: StoredMember): string {
  const raw = member.tamerName?.trim() || member.displayLabel?.trim() || ''
  return raw.toLowerCase()
}

function partyPlayerSetKey(members: StoredMember[]): string {
  return members
    .map((m) => normalizePlayerKey(m))
    .filter(Boolean)
    .sort()
    .join('\u0001')
}

function clientCompleteTimeSec(payload: DungeonPayload): number | null {
  const cc = Number(payload.dungeon?.clientComplete?.timeSec)
  if (!Number.isFinite(cc) || cc <= 0) return null
  return Math.round(cc)
}

function raidDamageTotal(payload: DungeonPayload, members: StoredMember[]): number {
  const sum = members.reduce((s, m) => s + memberDamageTotal(m), 0)
  return Math.max(Number(payload.raidTotalDamage) || 0, sum, 0)
}

function sharesIsSelfPlayer(a: DungeonPayload, b: DungeonPayload): boolean {
  const aSelf = new Set(selfPlayerKeysFromPayload(a))
  if (!aSelf.size) return false
  return selfPlayerKeysFromPayload(b).some((k) => aSelf.has(k))
}

/**
 * Near-identical damage signature — used to collapse same-uploader retries of one
 * clear without merging distinct back-to-back farm pulls.
 */
function partyDamageCompatibleForReupload(
  aPayload: DungeonPayload,
  aMembers: StoredMember[],
  bPayload: DungeonPayload,
  bMembers: StoredMember[],
): boolean {
  const raidA = raidDamageTotal(aPayload, aMembers)
  const raidB = raidDamageTotal(bPayload, bMembers)
  const raidMax = Math.max(raidA, raidB, 1)
  if (Math.abs(raidA - raidB) / raidMax > PARTY_REUPLOAD_RAID_REL_TOLERANCE) return false

  const mapB = new Map<string, number>()
  for (const m of bMembers) {
    const key = normalizePlayerKey(m)
    if (key) mapB.set(key, memberDamageTotal(m))
  }
  for (const m of aMembers) {
    const key = normalizePlayerKey(m)
    if (!key) continue
    const dmgB = mapB.get(key)
    if (dmgB == null) continue
    const dmgA = memberDamageTotal(m)
    const max = Math.max(dmgA, dmgB, 1)
    if (Math.abs(dmgA - dmgB) / max > PARTY_REUPLOAD_MEMBER_REL_TOLERANCE) return false
  }
  return true
}

function buildPartyRunFingerprint(
  dungeonId: string,
  difficultyId: number,
  durationSec: number,
  members: StoredMember[],
  clearTimeSec: number | null = null,
): string {
  const players = partyPlayerSetKey(members)
  const dur = Math.max(0, Math.round(durationSec))
  const clear = clearTimeSec != null && clearTimeSec > 0 ? `c${Math.round(clearTimeSec)}` : 'c?'
  return `${dungeonId.trim()}:${difficultyId}:${dur}:${clear}:${players}`
}

function selfPlayerKeysFromPayload(payload: DungeonPayload): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const member of payload.members ?? []) {
    if (member.isSelf !== true) continue
    const key = normalizePlayerKey(member)
    if (!key || seen.has(key)) continue
    seen.add(key)
    keys.push(key)
  }
  return keys
}

/**
 * Canonical row owner for isSelf after a peer merge. Prefer the single self on the
 * canonical upload; if that row was already contaminated, drop selves that belong to
 * the incoming peer upload.
 */
function resolveCanonicalOwnerSelfKey(
  canonical: DungeonPayload,
  incoming: DungeonPayload,
): string | null {
  const canonSelves = selfPlayerKeysFromPayload(canonical)
  const incomingSelves = new Set(selfPlayerKeysFromPayload(incoming))
  if (canonSelves.length === 1) return canonSelves[0]!
  const owned = canonSelves.filter((key) => !incomingSelves.has(key))
  if (owned.length >= 1) return owned[0]!
  return canonSelves[0] ?? null
}

/**
 * Peer kit merge may temporarily keep multiple isSelf flags; persisted payloads must
 * only mark the owning upload's tamer as self (otherwise co-meters leak into identity).
 */
function restrictIsSelfToOwner(
  payload: DungeonPayload,
  ownerSelfKey: string | null,
): DungeonPayload {
  const members = Array.isArray(payload.members) ? payload.members : []
  if (!ownerSelfKey) {
    let kept = false
    return {
      ...payload,
      members: members.map((member) => {
        if (member.isSelf !== true) return { ...member, isSelf: false }
        if (kept) return { ...member, isSelf: false }
        kept = true
        return { ...member, isSelf: true }
      }),
    }
  }
  return {
    ...payload,
    members: members.map((member) => ({
      ...member,
      isSelf: normalizePlayerKey(member) === ownerSelfKey,
    })),
  }
}

/**
 * Prefer each player's isSelf kit when merging peer uploads of the same clear.
 * Peer party_skill may still emit parent skill *ids* for same-model alts; skill *names*
 * from EventStream are preferred during alternate-structure resolution.
 *
 * Kit preference may keep peer isSelf flags in-memory; callers must run
 * `restrictIsSelfToOwner` before persisting onto a specific parse row.
 */
function mergePartyPayloads(canonical: DungeonPayload, incoming: DungeonPayload): DungeonPayload {
  const canonMembers = Array.isArray(canonical.members) ? canonical.members : []
  const inMembers = Array.isArray(incoming.members) ? incoming.members : []
  const byKey = new Map<string, StoredMember>()

  for (const member of canonMembers) {
    const key = normalizePlayerKey(member)
    if (key) byKey.set(key, member)
  }

  for (const member of inMembers) {
    const key = normalizePlayerKey(member)
    if (!key) continue
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, member)
      continue
    }
    if (member.isSelf === true && existing.isSelf !== true) {
      byKey.set(key, member)
    } else if (member.isSelf === true && existing.isSelf === true) {
      // Keep canonical isSelf row.
    } else if (member.isSelf !== true && existing.isSelf === true) {
      // Keep authoritative isSelf row.
    } else if (memberDamageTotal(member) > memberDamageTotal(existing)) {
      // Neither isSelf — prefer the healthier damage attribution.
      byKey.set(key, member)
    }
  }

  const mergedMembers: StoredMember[] = []
  const seen = new Set<string>()
  for (const member of canonMembers) {
    const key = normalizePlayerKey(member)
    if (!key || seen.has(key)) continue
    const chosen = byKey.get(key)
    if (chosen) {
      mergedMembers.push(chosen)
      seen.add(key)
    }
  }
  for (const member of inMembers) {
    const key = normalizePlayerKey(member)
    if (!key || seen.has(key)) continue
    const chosen = byKey.get(key)
    if (chosen) {
      mergedMembers.push(chosen)
      seen.add(key)
    }
  }

  const canonRaid = Math.max(0, Number(canonical.raidTotalDamage) || 0)
  const inRaid = Math.max(0, Number(incoming.raidTotalDamage) || 0)

  return {
    ...canonical,
    members: mergedMembers,
    raidTotalDamage: Math.max(canonRaid, inRaid) || canonical.raidTotalDamage,
    dungeon: canonical.dungeon ?? incoming.dungeon,
    sessionDurationSec: canonical.sessionDurationSec ?? incoming.sessionDurationSec,
  }
}

async function findSoftDuplicatePartyParseInWindow(
  supabase: ReturnType<typeof createClient>,
  params: {
    dungeonId: string
    difficultyId: number
    durationSec: number
    members: StoredMember[]
    excludeParseId: string
    createdAt: string
    clearTimeSec?: number | null
    /** Incoming parse payload (raid totals / isSelf) for tighter same-clear checks. */
    payload?: DungeonPayload
  },
): Promise<string | null> {
  const playerKey = partyPlayerSetKey(params.members)
  if (!playerKey) return null

  const centerMs = new Date(params.createdAt).getTime()
  if (!Number.isFinite(centerMs)) return null
  const since = new Date(centerMs - PARTY_UPLOAD_DEDUPE_WINDOW_SEC * 1000).toISOString()
  const until = new Date(centerMs + PARTY_UPLOAD_DEDUPE_WINDOW_SEC * 1000).toISOString()

  const { data, error } = await supabase
    .from('meter_parses')
    .select('id, created_at, duration_sec, payload')
    .eq('parse_kind', 'dungeon_party')
    .eq('dungeon_id', params.dungeonId)
    .eq('difficulty_id', params.difficultyId)
    .neq('id', params.excludeParseId)
    .gte('created_at', since)
    .lte('created_at', until)
    .order('created_at', { ascending: true })
    .limit(80)

  if (error || !data?.length) return null

  const dur = Math.max(0, Math.round(params.durationSec))
  const incomingClear =
    params.clearTimeSec != null && Number.isFinite(params.clearTimeSec) && params.clearTimeSec > 0
      ? Math.round(params.clearTimeSec)
      : null
  const incomingPayload: DungeonPayload = {
    ...(params.payload ?? {}),
    members: params.members,
  }
  type Candidate = {
    id: string
    createdAtMs: number
    durationDelta: number
    hasEntries: boolean
    broken: boolean
  }
  const candidates: Candidate[] = []

  for (const row of data) {
    const payload = (row.payload ?? {}) as DungeonPayload
    const members = payload.members ?? []
    if (partyPlayerSetKey(members) !== playerKey) continue
    const otherDur = Math.max(
      0,
      Math.round(sessionDuration(payload, Number(row.duration_sec) || 0, members)),
    )
    const durationDelta = Math.abs(otherDur - dur)
    if (durationDelta > PARTY_DURATION_TOLERANCE_SEC) continue
    const createdAtMs = new Date(String(row.created_at)).getTime()
    if (!Number.isFinite(createdAtMs)) continue

    const otherClear = clientCompleteTimeSec(payload)
    if (incomingClear != null && otherClear != null) {
      // Same party + similar meter duration is not enough when farming; clear clocks
      // distinguish back-to-back pulls (142s vs 144s) that used to false-merge.
      if (Math.abs(otherClear - incomingClear) > PARTY_CLEAR_TIME_TOLERANCE_SEC) continue
      // Identical clear clocks still collide when farming consistently — peer meters
      // of one pull upload close together; multi-minute gaps are later pulls.
      if (Math.abs(createdAtMs - centerMs) > PARTY_UPLOAD_WITH_CLEAR_MAX_GAP_SEC * 1000) continue
    } else if (Math.abs(createdAtMs - centerMs) > PARTY_UPLOAD_NO_CLEAR_MAX_GAP_SEC * 1000) {
      // Without a clear clock, refuse to merge uploads minutes apart.
      continue
    }

    // Soft-dedupe is for peer meters of one clear (different isSelf). Same meter
    // user farming back-to-back shares isSelf — only collapse near-identical retries.
    if (sharesIsSelfPlayer(incomingPayload, payload)) {
      if (!partyDamageCompatibleForReupload(incomingPayload, params.members, payload, members)) {
        continue
      }
    }

    candidates.push({
      id: String(row.id),
      createdAtMs,
      durationDelta,
      hasEntries: false,
      broken: isBrokenPartyParse(payload, members),
    })
  }

  if (!candidates.length) return null

  const candidateIds = candidates.map((c) => c.id)
  const { data: entryRows } = await supabase
    .from('meter_leaderboard_entries')
    .select('parse_id')
    .in('parse_id', candidateIds)
  const withEntries = new Set(
    (entryRows ?? []).map((r) => String(r.parse_id ?? '').trim()).filter(Boolean),
  )
  for (const c of candidates) c.hasEntries = withEntries.has(c.id)

  // Prefer a ranked/healthy peer parse over a broken upload (Mist at 0% on
  // Tirweth/Prex meters). Among equals, prefer closest upload time then duration.
  candidates.sort((a, b) => {
    if (a.hasEntries !== b.hasEntries) return a.hasEntries ? -1 : 1
    if (a.broken !== b.broken) return a.broken ? 1 : -1
    const timeA = Math.abs(a.createdAtMs - centerMs)
    const timeB = Math.abs(b.createdAtMs - centerMs)
    if (timeA !== timeB) return timeA - timeB
    if (a.durationDelta !== b.durationDelta) return a.durationDelta - b.durationDelta
    return a.createdAtMs - b.createdAtMs
  })

  return candidates[0]?.id ?? null
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

/** In-game results-screen clear time; falls back to meter session duration. */
function clearTimeDuration(payload: DungeonPayload, rowDurationSec: number, members: StoredMember[]): number {
  const cc = Number(payload.dungeon?.clientComplete?.timeSec)
  if (Number.isFinite(cc) && cc > 0) return cc
  return sessionDuration(payload, rowDurationSec, members)
}

/**
 * Denominator for DPS: the meter session time, unless it diverges from the in-game clear
 * time by {@link DPS_CLEAR_TIME_GAP_SEC} or more — in which case the in-game clear time is used
 * (the meter combat window is unreliable when the two clocks disagree by that much).
 */
function dpsDurationSeconds(payload: DungeonPayload, rowDurationSec: number, members: StoredMember[]): number {
  const session = sessionDuration(payload, rowDurationSec, members)
  const cc = Number(payload.dungeon?.clientComplete?.timeSec)
  if (Number.isFinite(cc) && cc > 0 && Math.abs(cc - session) >= DPS_CLEAR_TIME_GAP_SEC) {
    return cc
  }
  return session
}

function memberDps(
  member: StoredMember,
  payload: DungeonPayload,
  rowDurationSec: number,
  members: StoredMember[],
): number {
  const damage = memberDamageTotal(member)
  const dur = Math.max(dpsDurationSeconds(payload, rowDurationSec, members), Number(member.durationSec) || 0, 1e-6)
  return dur > 0 ? damage / dur : 0
}

/** Digimon with the highest damage this run (not end-of-run swap). */
function memberPrimaryDigimon(
  member: StoredMember,
  _wikiCatalog?: Map<string, RoleBucket | null>,
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
  const primary = memberPrimaryDigimon(member, wikiCatalog)
  if (!primary) return memberDamageTotal(member)
  const dmg = Math.max(0, totals.get(primary.digimonId?.trim() ?? '') ?? 0)
  return dmg > 0 ? dmg : memberDamageTotal(member)
}

/** True when the tamer dealt damage on digimon from 2+ role buckets (e.g. Support + Caster Mastemon). */
function memberHasMultipleRoleBuckets(
  member: StoredMember,
  wikiCatalog?: Map<string, RoleBucket | null>,
): boolean {
  if (!wikiCatalog?.size) return false
  const buckets = new Set<RoleBucket>()
  for (const dg of memberDigimons(member)) {
    const id = dg.digimonId?.trim() ?? ''
    if (!id || (Number(dg.totalDamage) || 0) <= 0) continue
    const bucket = wikiCatalog.get(id)
    if (!bucket) continue
    buckets.add(bucket)
    if (buckets.size > 1) return true
  }
  return false
}

async function memberDpsForLeaderboard(
  member: StoredMember,
  payload: DungeonPayload,
  rowDurationSec: number,
  members: StoredMember[],
  wikiCatalog?: Map<string, RoleBucket | null>,
): Promise<number> {
  reconcileJustimonMisattribution(member)
  if (wikiCatalog) await ensureWikiRolesForMember(member, wikiCatalog)
  const digimons = memberDigimons(member)
  // Multi-role runs: credit full tamer damage. Same-role multi-form still uses primary digimon only.
  const damage =
    digimons.length > 1 && memberHasMultipleRoleBuckets(member, wikiCatalog)
      ? memberDamageTotal(member)
      : digimons.length > 1
        ? primaryDigimonDamage(member, wikiCatalog)
        : memberDamageTotal(member)
  const dur = Math.max(dpsDurationSeconds(payload, rowDurationSec, members), Number(member.durationSec) || 0, 1e-6)
  return dur > 0 ? damage / dur : 0
}

function isBrokenPartyParse(payload: DungeonPayload, members: StoredMember[]): boolean {
  if (members.length < 2) return false
  // Missing digimon rows = meter failed to attribute a party slot.
  if (members.some((m) => memberDigimons(m).length === 0)) return true
  const damages = members.map((m) => memberDamageTotal(m))
  const sumMember = damages.reduce((s, d) => s + d, 0)
  const raidTotal = Math.max(Number(payload.raidTotalDamage) || 0, sumMember, 1)
  const maxDmg = Math.max(0, ...damages)
  if (maxDmg <= 0) return false
  // A member doing little/no damage is valid (passenger / bad pull). Only reject
  // when attribution looks collapsed onto one player (~all damage on one seat).
  const nearZeroCount = damages.filter((d) => d < raidTotal * MIN_PARTY_DAMAGE_SHARE).length
  const nonzeroCount = damages.filter((d) => d >= raidTotal * MIN_PARTY_DAMAGE_SHARE).length
  if (nonzeroCount <= 1 && maxDmg >= raidTotal * 0.88) return true
  if (maxDmg >= raidTotal * 0.9 && nearZeroCount >= members.length - 1) return true
  return false
}

const MEMBER_SPIKE_MAX_ACTIVE_SEC = 3
const MEMBER_SPIKE_MIN_SESSION_OVERHANG_SEC = 5

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
  if (wikiRoleCatalog && wikiMetaCatalog && Date.now() - wikiRoleCatalogLoadedAt < WIKI_CATALOG_TTL_MS) {
    return wikiRoleCatalog
  }

  const roleMap = new Map<string, RoleBucket | null>()
  const metaMap = new Map<string, { name: string; modelId: string; role: string }>()
  let page = 1
  let totalPages = 1

  while (page <= totalPages) {
    const join = WIKI_DIGIMON_LIST_URL.includes('?') ? '&' : '?'
    const url = `${WIKI_DIGIMON_LIST_URL}${join}page=${page}&per_page=500`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) break
    const raw = (await res.json()) as {
      data?: Array<{ id?: string; role?: string; name?: string; model_id?: string }>
      total_pages?: number
    }
    totalPages = Math.max(1, Number(raw.total_pages) || 1)
    for (const d of raw.data ?? []) {
      const id = String(d.id ?? '').trim()
      if (!id) continue
      const role = typeof d.role === 'string' ? d.role.trim() : ''
      const name = typeof d.name === 'string' ? d.name.trim() : ''
      const modelId = typeof d.model_id === 'string' ? d.model_id.trim() : ''
      roleMap.set(id, wikiRoleToBucket(role))
      metaMap.set(id, { name, modelId, role })
    }
    page += 1
  }

  if (roleMap.size > 0) {
    wikiRoleCatalog = roleMap
    wikiMetaCatalog = metaMap
    wikiRoleCatalogLoadedAt = Date.now()
  }
  return roleMap
}

function getWikiMetaCatalog(): Map<string, { name: string; modelId: string; role: string }> {
  return wikiMetaCatalog ?? new Map()
}

function primaryDigimonSkillKeys(
  primary: NonNullable<ReturnType<typeof memberPrimaryDigimon>>,
): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const skill of primary.skills ?? []) {
    const key = String(skill.skillKey ?? '').trim().toLowerCase()
    if (!key || key === '(basic)' || seen.has(key)) continue
    seen.add(key)
    keys.push(key)
  }
  return keys
}

function primaryDigimonSkillNames(
  primary: NonNullable<ReturnType<typeof memberPrimaryDigimon>>,
): string[] {
  const names: string[] = []
  const seen = new Set<string>()
  for (const skill of primary.skills ?? []) {
    const name = String(skill.skill ?? '').trim().toLowerCase()
    if (!name || name === '(basic)' || name === 'auto attack' || seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
}

async function resolvePrimaryDigimonIdentity(
  primary: NonNullable<ReturnType<typeof memberPrimaryDigimon>>,
  wikiCatalog: Map<string, RoleBucket | null>,
  roleCache: Map<string, RoleBucket | null>,
): Promise<{
  digimonId: string
  digimonName: string
  iconId: string | null
  roleBucket: RoleBucket | null
  parentDigimonId?: string
}> {
  const parentDigimonId = primary.digimonId?.trim() || ''
  const iconId = primary.iconId?.trim() || null
  const parentMeta = getWikiMetaCatalog().get(parentDigimonId)
  const effective = await resolveEffectiveDigimonIdentity({
    digimonId: parentDigimonId,
    iconId,
    digimonName: primary.digimonName?.trim() || parentMeta?.name || '',
    parentModelId: parentMeta?.modelId || null,
    parentName: parentMeta?.name || null,
    parentRole: parentMeta?.role || null,
    skillKeys: primaryDigimonSkillKeys(primary),
    skillNames: primaryDigimonSkillNames(primary),
  })

  const digimonId = effective.digimonId || parentDigimonId
  let roleBucket = roleCache.get(digimonId) ?? wikiCatalog.get(digimonId) ?? null
  if (!roleBucket && effective.wikiRole) {
    roleBucket = wikiRoleToBucket(effective.wikiRole)
    roleCache.set(digimonId, roleBucket)
  }
  if (!roleBucket && !wikiCatalog.has(digimonId) && effective.wikiRole) {
    wikiCatalog.set(digimonId, wikiRoleToBucket(effective.wikiRole))
    roleBucket = wikiCatalog.get(digimonId) ?? null
  }

  return {
    digimonId,
    digimonName: effective.digimonName || primary.digimonName?.trim() || parentMeta?.name || '',
    iconId: effective.iconId || iconId,
    roleBucket,
    parentDigimonId: effective.isAlternateStructure ? parentDigimonId : undefined,
  }
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

/** Fill wiki catalog gaps for a member's digimon (list catalog can miss ids that detail has). */
async function ensureWikiRolesForMember(
  member: StoredMember,
  wikiCatalog: Map<string, RoleBucket | null>,
): Promise<void> {
  const missing: string[] = []
  for (const dg of memberDigimons(member)) {
    const id = dg.digimonId?.trim() ?? ''
    if (!id || (Number(dg.totalDamage) || 0) <= 0) continue
    if (!wikiCatalog.has(id)) missing.push(id)
  }
  if (!missing.length) return
  await Promise.all(
    missing.map(async (id) => {
      const meta = await fetchWikiDigimon(id)
      wikiCatalog.set(id, wikiRoleToBucket(meta.role))
      if (meta.name || meta.role) {
        const metaMap = getWikiMetaCatalog()
        if (!metaMap.has(id)) {
          metaMap.set(id, {
            name: meta.name ?? '',
            modelId: '',
            role: meta.role ?? '',
          })
        }
      }
    }),
  )
}

async function resolveRoleBucket(
  member: StoredMember,
  _summaryMember: SummaryMember | undefined,
  roleCache: Map<string, RoleBucket | null>,
  wikiCatalog: Map<string, RoleBucket | null>,
): Promise<RoleBucket | null> {
  const primary = memberPrimaryDigimon(member, wikiCatalog)
  if (!primary?.digimonId?.trim()) return null
  const resolved = await resolvePrimaryDigimonIdentity(primary, wikiCatalog, roleCache)
  return resolved.roleBucket
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
  const dungeonLeaderboardEligible = payload.dungeon?.leaderboardEligible === true
  const roleCache = new Map<string, RoleBucket | null>()
  const out: SummaryMember[] = []
  for (const member of members) {
    if (!isMemberLeaderboardEligible(member, sessionDur, dungeonLeaderboardEligible)) continue
    const primary = memberPrimaryDigimon(member, wikiCatalog)
    const dps = await memberDpsForLeaderboard(member, payload, rowDurationSec, members, wikiCatalog)
    if (!primary?.digimonId?.trim()) {
      out.push({
        playerKey: normalizePlayerKey(member),
        displayName: member.tamerName?.trim() || member.displayLabel?.trim() || '',
        dps,
        digimonId: '',
        digimonName: primary?.digimonName?.trim() || '',
        iconId: primary?.iconId?.trim() || null,
        portraitUrl: primary?.portraitUrl,
        roleBucket: null,
      })
      continue
    }
    const resolved = await resolvePrimaryDigimonIdentity(primary, wikiCatalog, roleCache)
    out.push({
      playerKey: normalizePlayerKey(member),
      displayName: member.tamerName?.trim() || member.displayLabel?.trim() || '',
      dps,
      digimonId: resolved.digimonId,
      digimonName: resolved.digimonName,
      iconId: resolved.iconId,
      portraitUrl: primary?.portraitUrl,
      roleBucket: resolved.roleBucket,
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
  const clearTimeSec = clientCompleteTimeSec(payload)
  const fingerprint =
    members.length > 0
      ? buildPartyRunFingerprint(dungeonId, difficultyId, durationSec, members, clearTimeSec)
      : null

  if (fingerprint && !force && !options.skipDuplicateCheck) {
    const dupId = await findSoftDuplicatePartyParseInWindow(supabase, {
      dungeonId,
      difficultyId,
      durationSec,
      members,
      excludeParseId: row.id,
      createdAt: row.created_at,
      clearTimeSec,
      payload,
    })
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

      const canonicalPayload = (canonical.payload ?? {}) as DungeonPayload
      const incomingPayload = (row.payload ?? canonical.payload ?? {}) as DungeonPayload
      const ownerSelfKey = resolveCanonicalOwnerSelfKey(canonicalPayload, incomingPayload)
      const mergedPayload = restrictIsSelfToOwner(
        mergePartyPayloads(canonicalPayload, incomingPayload),
        ownerSelfKey,
      )
      const mergedDurationSec =
        sessionDuration(mergedPayload, Number(row.duration_sec) || Number(canonical.duration_sec) || 0, mergedPayload.members ?? []) ||
        Number(row.duration_sec) ||
        Number(canonical.duration_sec) ||
        0
      const mergedFingerprint = buildPartyRunFingerprint(
        dungeonId,
        difficultyId,
        mergedDurationSec,
        mergedPayload.members ?? [],
        clientCompleteTimeSec(mergedPayload),
      )

      await supabase
        .from('meter_parses')
        .update({
          payload: mergedPayload,
          party_fingerprint: mergedFingerprint,
          duration_sec: mergedDurationSec,
        })
        .eq('id', dupId)

      const mergedRow: ParseRow = {
        ...(canonical as ParseRow),
        payload: mergedPayload,
        leaderboard_summary: row.leaderboard_summary ?? canonical.leaderboard_summary,
        duration_sec: mergedDurationSec,
      }
      // Force rewrite so isSelf skill kits refresh digimonId/role_bucket on existing entries.
      const merged = await processParse(mergedRow, supabase, {
        ...options,
        skipDuplicateCheck: true,
        force: true,
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

  const wikiCatalog = await loadWikiRoleCatalog()
  let summary =
    members.length > 0
      ? await buildSummaryFromPayload(payload, Number(row.duration_sec) || 0, wikiCatalog)
      : row.leaderboard_summary
  // Keep an explicit ineligible summary. Only fall back when buildSummary returned
  // nothing useful.
  if (summary == null) {
    summary = row.leaderboard_summary
  } else if (summary.eligible !== false && !summary.members?.length) {
    summary = row.leaderboard_summary ?? summary
  }

  if (!summary?.eligible) {
    if (summary && summary.eligible === false) {
      await supabase.from('meter_parses').update({ leaderboard_summary: summary }).eq('id', row.id)
    }
    return {
      inserted: 0,
      skipped: summary?.invalidateReason ?? 'not leaderboard eligible',
    }
  }

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
  const entries: Array<Record<string, unknown>> = []
  const enrichedByPlayerKey = new Map<
    string,
    {
      digimonId: string
      digimonName: string
      iconId: string | null
      portraitUrl: string | null
      roleBucket: RoleBucket | null
    }
  >()

  const sessionDur = sessionDuration(payload, Number(row.duration_sec) || 0, members)
  const dungeonLeaderboardEligible = payload.dungeon?.leaderboardEligible === true
  for (const member of memberList) {
    if (!isMemberLeaderboardEligible(member, sessionDur, dungeonLeaderboardEligible)) continue
    const playerKey = normalizePlayerKey(member)
    if (!playerKey || (!force && existingPlayerKeys.has(playerKey))) continue
    const sm = summaryByKey.get(playerKey)
    const primary = memberPrimaryDigimon(member, wikiCatalog)
    if (!primary?.digimonId?.trim()) continue
    const resolved = await resolvePrimaryDigimonIdentity(primary, wikiCatalog, roleCache)
    const roleBucket = resolved.roleBucket
    if (!roleBucket) continue

    const digimonId = resolved.digimonId
    const officialName = resolved.digimonName
    const iconId = resolved.iconId || sm?.iconId?.trim() || primary?.iconId?.trim() || null
    const payloadPortrait = sm?.portraitUrl?.trim() || primary?.portraitUrl || null
    const portraitUrl = portraitUrlForResolvedIcon(iconId, payloadPortrait)

    const dps = await memberDpsForLeaderboard(
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
      icon_id: iconId,
      portrait_url: portraitUrl,
    })
    enrichedByPlayerKey.set(playerKey, {
      digimonId,
      digimonName: officialName || sm?.digimonName?.trim() || primary?.digimonName?.trim() || '',
      iconId,
      portraitUrl,
      roleBucket,
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
      const enriched = enrichedByPlayerKey.get(key)
      return {
        ...sm,
        digimonId: enriched?.digimonId || sm.digimonId,
        digimonName: enriched?.digimonName || sm.digimonName,
        iconId: enriched?.iconId ?? sm.iconId ?? null,
        portraitUrl: enriched?.portraitUrl || sm.portraitUrl,
        roleBucket: enriched?.roleBucket ?? sm.roleBucket ?? null,
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
