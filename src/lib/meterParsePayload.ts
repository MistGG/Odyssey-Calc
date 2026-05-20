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
  digimons?: DigimonSkillBreakdownStored[]
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

export function partyMembersFromPayload(payload: unknown): MeterPartyMemberStored[] {
  if (isDungeonPartyParsePayload(payload)) return payload.members
  if (!isPartyParsePayload(payload)) return []
  return payload.members
}

export function dungeonFromPayload(payload: unknown): MeterParseDungeonStored | null {
  if (!isDungeonPartyParsePayload(payload)) return null
  return payload.dungeon
}

export function parseRunOutcomeFromPayload(payload: unknown): MeterParseDungeonStored['runOutcome'] {
  return dungeonFromPayload(payload)?.runOutcome ?? null
}

/** Failed dungeon runs are shown in My Parses only — never leaderboard or percentile coloring. */
export function isFailedDungeonParseRow(row: { payload: unknown }): boolean {
  return parseRunOutcomeFromPayload(row.payload) === 'fail'
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

export function memberDigimonBreakdowns(member: MeterPartyMemberStored): DigimonSkillBreakdownStored[] {
  if (member.digimons?.length) return member.digimons
  if (!member.skills.length) return []
  const iconId = member.portraitIconId?.trim() || ''
  return [
    {
      digimonId: member.currentDigimonId?.trim() || 'unknown',
      digimonName: member.currentDigimonName?.trim() || member.displayLabel,
      iconId: iconId || null,
      portraitUrl:
        member.portraitUrl ||
        (iconId ? digimonPortraitUrl(iconId, member.currentDigimonId ?? '', member.currentDigimonName ?? '') : undefined),
      totalDamage: member.totalDamage,
      skills: member.skills,
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
