import { fetchDigimonDetail } from '../api/digimonService'
import { digimonPortraitUrl } from './digimonImage'
import {
  memberDigimonBreakdowns,
  type DigimonSkillBreakdownStored,
  type MeterParsePayloadDungeonPartyStored,
  type MeterPartyMemberStored,
} from './meterParsePayload'
import type { WikiDigimonDetail } from '../types/wikiApi'

const detailCache = new Map<string, WikiDigimonDetail>()
const detailPromiseCache = new Map<string, Promise<WikiDigimonDetail | null>>()

function normSkillKey(key: string | undefined): string | null {
  const k = key?.trim()
  if (!k || k === '(basic)') return null
  return k.toLowerCase()
}

function usedSkillKeysFromDigimon(dg: DigimonSkillBreakdownStored): string[] {
  const keys = new Set<string>()
  for (const skill of dg.skills ?? []) {
    const k = normSkillKey(skill.skillKey)
    if (k) keys.add(k)
  }
  return [...keys]
}

function wikiSkillIdSet(detail: WikiDigimonDetail): Set<string> {
  const ids = new Set<string>()
  for (const skill of detail.skills ?? []) {
    const id = skill.id?.trim()
    if (id) ids.add(id.toLowerCase())
  }
  return ids
}

function countSkillKeyOverlap(usedKeys: readonly string[], wikiIds: Set<string>): number {
  let n = 0
  for (const key of usedKeys) {
    if (wikiIds.has(key)) n += 1
  }
  return n
}

function storedDigimonMatchesSkills(storedDetail: WikiDigimonDetail, usedKeys: readonly string[]): boolean {
  if (!usedKeys.length) return true
  const wikiIds = wikiSkillIdSet(storedDetail)
  return usedKeys.every((key) => wikiIds.has(key))
}

async function fetchDigimonDetailCached(id: string): Promise<WikiDigimonDetail | null> {
  const key = id.trim()
  if (!key) return null
  const cached = detailCache.get(key)
  if (cached) return cached

  let pending = detailPromiseCache.get(key)
  if (!pending) {
    pending = fetchDigimonDetail(key).catch(() => null)
    detailPromiseCache.set(key, pending)
  }

  const detail = await pending
  if (detail) detailCache.set(key, detail)
  return detail
}

function evolutionCandidateIds(detail: WikiDigimonDetail): string[] {
  const nodes = detail.evolution_tree?.nodes ?? []
  const ids: string[] = []
  const seen = new Set<string>()
  for (const node of nodes) {
    const id = node.digimon_id?.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  if (ids.length) return ids
  return detail.id?.trim() ? [detail.id.trim()] : []
}

function evolutionSlot(detail: WikiDigimonDetail, digimonId: string): number {
  const node = detail.evolution_tree?.nodes?.find((n) => n.digimon_id === digimonId)
  return node?.slot ?? 0
}

export type ResolvedDigimonAttribution = {
  digimonId: string
  digimonName: string
  modelId: string
}

/** When companion stores an evolution line id, pick the form whose wiki skills match meter skill keys. */
export async function resolveDigimonFromSkillKeys(
  storedDigimonId: string,
  usedSkillKeys: readonly string[],
): Promise<ResolvedDigimonAttribution | null> {
  if (!usedSkillKeys.length) return null

  const storedDetail = await fetchDigimonDetailCached(storedDigimonId)
  if (!storedDetail) return null

  if (storedDigimonMatchesSkills(storedDetail, usedSkillKeys)) {
    return {
      digimonId: storedDetail.id,
      digimonName: storedDetail.name,
      modelId: storedDetail.model_id,
    }
  }

  const candidateIds = evolutionCandidateIds(storedDetail)
  let best: { detail: WikiDigimonDetail; score: number; slot: number } | null = null

  for (const candidateId of candidateIds) {
    const detail =
      candidateId === storedDetail.id ? storedDetail : await fetchDigimonDetailCached(candidateId)
    if (!detail) continue

    const score = countSkillKeyOverlap(usedSkillKeys, wikiSkillIdSet(detail))
    if (score <= 0) continue

    const slot = evolutionSlot(storedDetail, candidateId)
    if (
      !best ||
      score > best.score ||
      (score === best.score && slot > best.slot)
    ) {
      best = { detail, score, slot }
    }
  }

  if (!best) return null
  const minMatches = Math.min(usedSkillKeys.length, 2)
  if (best.score < minMatches) return null

  return {
    digimonId: best.detail.id,
    digimonName: best.detail.name,
    modelId: best.detail.model_id,
  }
}

function applyAttributionToDigimonRow(
  dg: DigimonSkillBreakdownStored,
  resolved: ResolvedDigimonAttribution,
): DigimonSkillBreakdownStored {
  return {
    ...dg,
    digimonId: resolved.digimonId,
    digimonName: resolved.digimonName,
    iconId: resolved.modelId || dg.iconId,
    portraitUrl: resolved.modelId
      ? digimonPortraitUrl(resolved.modelId, resolved.digimonId, resolved.digimonName)
      : dg.portraitUrl,
  }
}

/** Rewrite member digimon ids/names when stored line id does not match skill keys used. */
export async function reattributeMemberDigimonFromSkills(member: MeterPartyMemberStored): Promise<boolean> {
  const digimons = memberDigimonBreakdowns(member)
  if (!digimons.length) return false

  let changed = false
  const nextDigimons: DigimonSkillBreakdownStored[] = []

  for (const dg of digimons) {
    const usedKeys = usedSkillKeysFromDigimon(dg)
    if (!usedKeys.length) {
      nextDigimons.push(dg)
      continue
    }

    const resolved = await resolveDigimonFromSkillKeys(dg.digimonId, usedKeys)
    if (!resolved || resolved.digimonId === dg.digimonId) {
      nextDigimons.push(dg)
      continue
    }

    nextDigimons.push(applyAttributionToDigimonRow(dg, resolved))
    changed = true
  }

  if (!changed) return false

  member.digimons = nextDigimons
  const top = nextDigimons.reduce(
    (best, row) => (row.totalDamage > best.totalDamage ? row : best),
    nextDigimons[0]!,
  )
  member.currentDigimonId = top.digimonId
  member.currentDigimonName = top.digimonName
  if (top.iconId) {
    member.portraitIconId = top.iconId
    member.portraitUrl = top.portraitUrl
  }

  return true
}

export async function reattributePayloadMembersFromSkills(
  payload: MeterParsePayloadDungeonPartyStored,
): Promise<boolean> {
  let changed = false
  for (const member of payload.members) {
    if (await reattributeMemberDigimonFromSkills(member)) changed = true
  }
  return changed
}
