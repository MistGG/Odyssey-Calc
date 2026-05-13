export type MeterSkillRow = {
  skill: string
  damage: number
  hits: number
}

export type MeterPartyMemberStored = {
  memberKey: string
  displayLabel: string
  totalDamage: number
  durationSec: number
  skills: MeterSkillRow[]
}

export type MeterParsePayloadPartyStored = {
  schemaVersion: 2
  kind: 'party'
  partyKey: string
  capturedAtMs: number
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

function isPartyMemberRow(x: unknown): x is MeterPartyMemberStored {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  if (typeof o.memberKey !== 'string' || typeof o.displayLabel !== 'string') return false
  if (typeof o.totalDamage !== 'number' || !Number.isFinite(o.totalDamage)) return false
  if (typeof o.durationSec !== 'number' || !Number.isFinite(o.durationSec)) return false
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

export function partyMembersFromPayload(payload: unknown): MeterPartyMemberStored[] {
  if (!isPartyParsePayload(payload)) return []
  return payload.members
}

export function partyKeyFromPayload(payload: unknown): string | null {
  if (!isPartyParsePayload(payload)) return null
  return payload.partyKey
}

/** Read skill rows from `meter_parses.payload` (v1 or legacy `{ skills: [...] }` only). */
export function skillsFromPayload(payload: unknown): MeterSkillRow[] {
  if (!payload || typeof payload !== 'object') return []
  const p = payload as Record<string, unknown>
  const raw = p.skills
  if (!Array.isArray(raw)) return []
  return raw.filter(isSkillRow)
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
