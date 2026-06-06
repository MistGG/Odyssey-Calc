import { digimonPortraitUrl, skillIconUrl } from './digimonImage'
import {
  isCompanionOnlyAutoAttackIconUrl,
  isMeterAutoAttackSkill,
  meterAutoAttackIconUrl,
} from './meterBasicAttack'

export type MeterSkillRow = {
  skill: string
  damage: number
  hits: number
  skillKey?: string
  skillIconId?: string | null
  iconUrl?: string
}

export type DigimonSkillBreakdownStored = {
  digimonId: string
  digimonName: string
  iconId: string | null
  portraitUrl?: string
  totalDamage: number
  skills: MeterSkillRow[]
}

export type MeterPartyMemberStored = {
  memberKey: string
  displayLabel: string
  totalDamage: number
  durationSec: number
  skills: MeterSkillRow[]
  tamerName?: string
  currentDigimonName?: string | null
  currentDigimonId?: string | null
  portraitIconId?: string | null
  portraitUrl?: string
  isSelf?: boolean
  /** Mist custom bar theme id (Olympos XII earnables). */
  meterBarThemeId?: string
  digimons?: DigimonSkillBreakdownStored[]
  /** When false, member is excluded from leaderboards (e.g. died before clear). */
  leaderboardEligible?: boolean
  /** Companion death flags (any truthy value excludes the member). */
  died?: boolean
  isDead?: boolean
  deathBeforeClear?: boolean
}

export type MeterParseDungeonStored = {
  dungeonId: string
  dungeonName: string | null
  difficulty: string
  difficultyId: number
  mapName: string | null
  partyId: string | null
  bossTargets: string[]
  runOutcome: 'clear' | 'fail' | null
  leaderboardEligible?: boolean
}

export type MeterParsePayloadPartyStored = {
  schemaVersion: 2
  kind: 'party'
  partyKey: string
  capturedAtMs: number
  members: MeterPartyMemberStored[]
}

export type MeterParsePayloadDungeonPartyStored = {
  schemaVersion: 3
  kind: 'dungeon_party'
  capturedAtMs: number
  sessionDurationSec?: number
  raidTotalDamage?: number
  dungeon: MeterParseDungeonStored
  members: MeterPartyMemberStored[]
  /**
   * When true, `digimons[].digimonName` may be in-game nicknames.
   * Odyssey Calc resolves official wiki names from `digimonId` before display.
   */
  digimonNamesRequireWikiLookup?: boolean
}

function isSkillRow(x: unknown): x is MeterSkillRow {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return (
    typeof o.skill === 'string' &&
    typeof o.damage === 'number' &&
    Number.isFinite(o.damage) &&
    typeof o.hits === 'number' &&
    Number.isFinite(o.hits) &&
    o.hits >= 0
  )
}

function isDigimonBreakdown(x: unknown): x is DigimonSkillBreakdownStored {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  if (typeof o.digimonId !== 'string' || typeof o.digimonName !== 'string') return false
  if (typeof o.totalDamage !== 'number' || !Number.isFinite(o.totalDamage)) return false
  if (!Array.isArray(o.skills)) return false
  return o.skills.every(isSkillRow)
}

function isPartyMemberRow(x: unknown): x is MeterPartyMemberStored {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  if (typeof o.memberKey !== 'string' || typeof o.displayLabel !== 'string') return false
  if (typeof o.totalDamage !== 'number' || !Number.isFinite(o.totalDamage)) return false
  if (typeof o.durationSec !== 'number' || !Number.isFinite(o.durationSec)) return false
  if (Array.isArray(o.digimons) && o.digimons.every(isDigimonBreakdown)) return true
  if (!Array.isArray(o.skills)) return false
  return o.skills.every(isSkillRow)
}

export function isPartyParsePayload(payload: unknown): payload is MeterParsePayloadPartyStored {
  if (!payload || typeof payload !== 'object') return false
  const p = payload as Record<string, unknown>
  if (p.schemaVersion !== 2 || p.kind !== 'party') return false
  if (typeof p.partyKey !== 'string') return false
  if (!Array.isArray(p.members)) return false
  return p.members.every(isPartyMemberRow)
}

export function isDungeonPartyParsePayload(
  payload: unknown,
): payload is MeterParsePayloadDungeonPartyStored {
  if (!payload || typeof payload !== 'object') return false
  const p = payload as Record<string, unknown>
  if (p.schemaVersion !== 3 || p.kind !== 'dungeon_party') return false
  const d = p.dungeon
  if (!d || typeof d !== 'object') return false
  const dungeon = d as Record<string, unknown>
  if (typeof dungeon.dungeonId !== 'string') return false
  if (typeof dungeon.difficulty !== 'string') return false
  if (typeof dungeon.difficultyId !== 'number') return false
  if (!Array.isArray(p.members)) return false
  return p.members.every(isPartyMemberRow)
}

function normalizeSkillRows(skills: unknown): MeterSkillRow[] {
  if (!Array.isArray(skills)) return []
  return skills.filter(isSkillRow)
}

function normalizeDigimonBreakdown(d: DigimonSkillBreakdownStored): DigimonSkillBreakdownStored {
  return { ...d, skills: normalizeSkillRows(d.skills) }
}

/** Ensures `skills` is always an array (uploads may only include `digimons`). */
export function normalizePartyMember(member: MeterPartyMemberStored): MeterPartyMemberStored {
  const digimons = Array.isArray(member.digimons)
    ? member.digimons.map(normalizeDigimonBreakdown)
    : undefined
  return {
    ...member,
    skills: normalizeSkillRows(member.skills),
    digimons: digimons?.length ? digimons : undefined,
  }
}

export function partyMembersFromPayload(payload: unknown): MeterPartyMemberStored[] {
  if (isDungeonPartyParsePayload(payload)) {
    return payload.members.map(normalizePartyMember)
  }
  if (!isPartyParsePayload(payload)) return []
  return payload.members.map(normalizePartyMember)
}

export function dungeonFromPayload(payload: unknown): MeterParseDungeonStored | null {
  if (!isDungeonPartyParsePayload(payload)) return null
  const d = payload.dungeon
  const bosses = Array.isArray(d.bossTargets)
    ? d.bossTargets.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    : []
  return { ...d, bossTargets: bosses }
}

export function parseRunOutcomeFromPayload(payload: unknown): MeterParseDungeonStored['runOutcome'] {
  return dungeonFromPayload(payload)?.runOutcome ?? null
}

/** True only for full boss clears (client API). Mid-run manual uploads are stored but unranked. */
export function isLeaderboardEligibleDungeonParsePayload(payload: unknown): boolean {
  const dungeon = dungeonFromPayload(payload)
  if (!dungeon) return false
  if (dungeon.leaderboardEligible === false) return false
  if (typeof dungeon.leaderboardEligible === 'boolean') return dungeon.leaderboardEligible
  return dungeon.runOutcome === 'clear'
}

/** Failed dungeon runs are shown in My Parses only — never leaderboard or percentile coloring. */
export function isFailedDungeonParseRow(row: { payload: unknown }): boolean {
  return parseRunOutcomeFromPayload(row.payload) === 'fail'
}

function bossTargetLooksLikeFinalDungeonBoss(name: string): boolean {
  return /<\s*dungeon\s+boss\s*>/i.test(name)
}

/** Minimum fight length for a ranked dungeon clear (shorter uploads are partial or death-spike snapshots). */
export const MIN_LEADERBOARD_DUNGEON_SESSION_SEC = 30

function memberRawFlags(member: MeterPartyMemberStored): Record<string, unknown> {
  return member as Record<string, unknown>
}

/** Per-player ranked eligibility (companion may flag deaths even when the party upload is a clear). */
export function isMemberLeaderboardEligible(
  member: MeterPartyMemberStored,
  payload?: unknown,
  rowDurationSec = 0,
  members?: MeterPartyMemberStored[],
): boolean {
  const raw = memberRawFlags(member)
  if (member.leaderboardEligible === false || raw.leaderboardEligible === false) return false
  if (member.died === true || member.isDead === true || member.deathBeforeClear === true) return false
  if (raw.died === true || raw.isDead === true || raw.deathBeforeClear === true) return false

  if (payload != null && members?.length) {
    const sessionDur = sessionDurationFromPayload(payload, rowDurationSec, members)
    const memberDur = Math.max(member.durationSec, 0)
    if (sessionDur >= MIN_LEADERBOARD_DUNGEON_SESSION_SEC && memberDur > 0 && memberDur < 3) {
      return false
    }
  }
  return true
}

/**
 * Companion ≤0.1.52 could auto-upload after the first objective batch (partial `bossTargets`, ~0–7s timer).
 * Excluded from leaderboards; still visible in My Parses as unranked.
 */
export function isPartialDungeonClearParse(
  payload: unknown,
  rowDurationSec = 0,
  _appVersion?: string | null,
): boolean {
  if (!isDungeonPartyParsePayload(payload)) return false
  const dungeon = payload.dungeon
  const markedClear =
    dungeon.runOutcome === 'clear' || dungeon.leaderboardEligible === true
  if (!markedClear) return false

  const members = partyMembersFromPayload(payload)
  const sessionDur = sessionDurationFromPayload(payload, rowDurationSec, members)
  const bosses = dungeon.bossTargets ?? []
  const hasFinalBoss = bosses.some((b) => bossTargetLooksLikeFinalDungeonBoss(b))

  // Never trust companion `leaderboardEligible` on very short timers (death-spike / partial snapshots).
  if (sessionDur > 0 && sessionDur < MIN_LEADERBOARD_DUNGEON_SESSION_SEC) {
    return true
  }

  if (dungeon.leaderboardEligible === true && sessionDur >= MIN_LEADERBOARD_DUNGEON_SESSION_SEC) {
    return false
  }

  if (bosses.length >= 2 && !hasFinalBoss) return true

  return false
}

export function raidTotalFromPayload(
  payload: unknown,
  members: MeterPartyMemberStored[],
): number {
  if (isDungeonPartyParsePayload(payload) && typeof payload.raidTotalDamage === 'number') {
    return Math.round(payload.raidTotalDamage)
  }
  let t = 0
  for (const m of members) t += m.totalDamage
  return Math.round(t)
}

export function sessionDurationFromPayload(
  payload: unknown,
  rowDurationSec: number,
  members: MeterPartyMemberStored[],
): number {
  if (isDungeonPartyParsePayload(payload) && typeof payload.sessionDurationSec === 'number') {
    return Math.max(0, payload.sessionDurationSec)
  }
  return Math.max(rowDurationSec, ...members.map((m) => m.durationSec), 0)
}

export function partyIdFromPayload(payload: unknown): string | null {
  if (!isDungeonPartyParsePayload(payload)) return null
  return payload.dungeon.partyId?.trim() || null
}

export function skillsFromPayload(payload: unknown): MeterSkillRow[] {
  if (!payload || typeof payload !== 'object') return []
  const p = payload as Record<string, unknown>
  const raw = p.skills
  if (!Array.isArray(raw)) return []
  return raw.filter(isSkillRow)
}

/** Meter logged at least one digimon row (or legacy per-member skills) for this player. */
export function partyMemberHasLoggedDigimon(member: MeterPartyMemberStored): boolean {
  return memberDigimonBreakdowns(member).length > 0
}

/** Minimum share of raid damage each party member must have for leaderboard eligibility. */
export const MIN_LEADERBOARD_PARTY_DAMAGE_SHARE = 0.02

/**
 * Invalid dungeon party parses — excluded from public leaderboard / percentile aggregates.
 * - Any member with no digimon or skill breakdown (meter failed to attribute a party slot).
 * - Any member below {@link MIN_LEADERBOARD_PARTY_DAMAGE_SHARE} of raid damage.
 * - One member credited with ~all raid damage while everyone else is ~zero.
 */
export function isBrokenMeterPartyParse(
  payload: unknown,
  members: MeterPartyMemberStored[],
): boolean {
  if (!isDungeonPartyParsePayload(payload)) return false
  if (members.length < 2) return false

  if (members.some((m) => !partyMemberHasLoggedDigimon(m))) return true

  const damages = members.map((m) => memberDamageTotal(m))
  const sumMember = damages.reduce((s, d) => s + d, 0)
  const raidTotal = Math.max(raidTotalFromPayload(payload, members), sumMember, 1)
  const maxDmg = Math.max(0, ...damages)
  if (maxDmg <= 0) return false

  if (damages.some((d) => d / raidTotal < MIN_LEADERBOARD_PARTY_DAMAGE_SHARE)) return true

  const nearZeroCount = damages.filter((d) => d < raidTotal * 0.02).length
  const nonzeroCount = damages.filter((d) => d >= raidTotal * 0.02).length

  if (nonzeroCount <= 1 && maxDmg >= raidTotal * 0.88) return true
  if (maxDmg >= raidTotal * 0.9 && nearZeroCount >= members.length - 1) return true

  return false
}

/** Broken party attribution — shown in My Parses with an Invalid tag; excluded from leaderboard. */
export function isInvalidMeterPartyParseRow(row: { payload: unknown }): boolean {
  const members = partyMembersFromPayload(row.payload)
  return isBrokenMeterPartyParse(row.payload, members)
}

/** Unranked or broken — excluded from public leaderboards and percentile coloring. */
export function isExcludedFromLeaderboardParseRow(row: {
  payload: unknown
  duration_sec?: number
  app_version?: string | null
  leaderboard_summary?: unknown
}): boolean {
  if (isDungeonPartyParsePayload(row.payload)) {
    if (isFailedDungeonParseRow(row)) return true
    if (isPartialDungeonClearParse(row.payload, row.duration_sec ?? 0, row.app_version)) return true
    if (!isLeaderboardEligibleDungeonParsePayload(row.payload)) return true
    const members = partyMembersFromPayload(row.payload)
    if (isBrokenMeterPartyParse(row.payload, members)) return true
    return false
  }

  const summary = row.leaderboard_summary as { eligible?: boolean } | null | undefined
  if (summary && typeof summary === 'object') {
    if (summary.eligible === false) return true
    if (summary.eligible === true) return false
  }

  const dur = row.duration_sec ?? 0
  if (dur > 0 && dur < MIN_LEADERBOARD_DUNGEON_SESSION_SEC) return true
  return false
}

/** Per-player damage: prefer digimon breakdown sum, then skills, then stored total. */
export function memberDamageTotal(member: MeterPartyMemberStored): number {
  const normalized = normalizePartyMember(member)
  const digimons = memberDigimonBreakdowns(normalized)
  if (digimons.length) {
    const sum = digimons.reduce((s, d) => s + Math.max(0, d.totalDamage), 0)
    if (sum > 0) return Math.round(sum)
  }
  if (normalized.skills.length) {
    return totalDamageFromSkills(normalized.skills)
  }
  return Math.round(Math.max(0, normalized.totalDamage))
}

export function memberDigimonBreakdowns(member: MeterPartyMemberStored): DigimonSkillBreakdownStored[] {
  const normalized = normalizePartyMember(member)
  if (normalized.digimons?.length) return normalized.digimons
  const skills = normalized.skills
  if (!skills.length) return []
  const iconId = normalized.portraitIconId?.trim() || ''
  return [
    {
      digimonId: normalized.currentDigimonId?.trim() || 'unknown',
      digimonName: normalized.currentDigimonName?.trim() || normalized.displayLabel,
      iconId: iconId || null,
      portraitUrl:
        normalized.portraitUrl ||
        (iconId
          ? digimonPortraitUrl(iconId, normalized.currentDigimonId ?? '', normalized.currentDigimonName ?? '')
          : undefined),
      totalDamage: normalized.totalDamage,
      skills,
    },
  ]
}

export function resolveMemberPortraitUrl(member: MeterPartyMemberStored): string | undefined {
  if (member.portraitUrl?.trim()) return member.portraitUrl.trim()
  const iconId = member.portraitIconId?.trim() || ''
  if (!iconId) return undefined
  return digimonPortraitUrl(iconId, member.currentDigimonId ?? '', member.currentDigimonName ?? member.displayLabel)
}

export function resolveDigimonPortraitUrl(d: DigimonSkillBreakdownStored): string | undefined {
  if (d.portraitUrl?.trim()) return d.portraitUrl.trim()
  const iconId = d.iconId?.trim() || ''
  if (!iconId) return undefined
  return digimonPortraitUrl(iconId, d.digimonId, d.digimonName)
}

export function resolveSkillIconUrl(skill: MeterSkillRow): string | undefined {
  if (isMeterAutoAttackSkill(skill)) return meterAutoAttackIconUrl()
  const stored = skill.iconUrl?.trim()
  if (stored && !isCompanionOnlyAutoAttackIconUrl(stored)) return stored
  const id = skill.skillIconId?.trim() || ''
  return id ? skillIconUrl(id) : undefined
}

export function totalDamageFromSkills(skills: MeterSkillRow[]): number {
  let t = 0
  for (const s of skills) t += s.damage
  return Math.round(t)
}

export function totalHitsFromSkills(skills: MeterSkillRow[]): number {
  let t = 0
  for (const s of skills) t += s.hits
  return t
}
