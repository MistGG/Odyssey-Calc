import { fetchDigimonDetail } from '../api/digimonService'
import type { WikiDigimonDetail, WikiDigimonSkin } from '../types/wikiApi'
import {
  alternateStructureBracketRole,
  alternateStructureListStub,
  bracketRoleToWikiRole,
  findAlternateStructureSkinByIcon,
  isAlternateStructureSkin,
} from './digimonAlternateStructure'
import { fetchWikiDigimonCatalog } from './meterRoleBuckets'

export type EffectiveDigimonIdentity = {
  /** Leaderboard / role lookup id (override id when on alternate structure). */
  digimonId: string
  digimonName: string
  iconId: string | null
  /** Raw wiki role string (e.g. Support, Melee DPS). */
  wikiRole: string
  /** Parent species id from the companion payload when an alternate structure is active. */
  parentDigimonId?: string
  isAlternateStructure: boolean
}

type ResolvedAlternate = EffectiveDigimonIdentity & { iconId: string }

const alternateResolutionCache = new Map<string, EffectiveDigimonIdentity>()
const parentDetailCache = new Map<string, WikiDigimonDetail>()

function normalizeSkillKey(key: string | null | undefined): string | null {
  const k = (key ?? '').trim().toLowerCase()
  if (!k || k === '(basic)') return null
  return k
}

function normalizeSkillName(name: string | null | undefined): string | null {
  const n = (name ?? '').trim().toLowerCase()
  if (!n || n === 'auto attack' || n === '(basic)') return null
  return n
}

function wikiSkillKeySet(detail: WikiDigimonDetail): Set<string> {
  const set = new Set<string>()
  for (const skill of detail.skills ?? []) {
    const key = normalizeSkillKey(skill.id)
    if (key) set.add(key)
  }
  return set
}

function wikiSkillNameSet(detail: WikiDigimonDetail): Set<string> {
  const set = new Set<string>()
  for (const skill of detail.skills ?? []) {
    const name = normalizeSkillName(skill.name)
    if (name) set.add(name)
  }
  return set
}

function wikiSkillKeyToNameMap(detail: WikiDigimonDetail): Map<string, string> {
  const map = new Map<string, string>()
  for (const skill of detail.skills ?? []) {
    const key = normalizeSkillKey(skill.id)
    const name = normalizeSkillName(skill.name)
    if (key && name) map.set(key, name)
  }
  return map
}

/**
 * Peer party_skill can still emit parent skill ids for same-model alts.
 * Prefer EventStream-recorded skill *names* when present (e.g. Seiken Grandalpha).
 */
function collectUsedSkillNames(
  memberSkillKeys: string[],
  recordedSkillNames: string[],
  parentDetail: WikiDigimonDetail,
  overrideDetail: WikiDigimonDetail,
): Set<string> {
  const names = new Set<string>()
  for (const raw of recordedSkillNames) {
    const name = normalizeSkillName(raw)
    if (name) names.add(name)
  }
  if (names.size > 0) return names

  const parentMap = wikiSkillKeyToNameMap(parentDetail)
  const overrideMap = wikiSkillKeyToNameMap(overrideDetail)
  for (const key of memberSkillKeys) {
    const name = parentMap.get(key) ?? overrideMap.get(key)
    if (name) names.add(name)
  }
  return names
}

function alternateResolutionCacheKey(
  parentDigimonId: string,
  iconId: string,
  skillKeys: string[],
  skillNames: string[],
): string {
  return `${parentDigimonId}|${iconId}|${[...skillKeys].sort().join(',')}|${[...skillNames].sort().join(',')}`
}

function identityFromSkin(
  parentDetail: WikiDigimonDetail,
  skin: WikiDigimonSkin,
  iconId: string,
  overrideRole = '',
): ResolvedAlternate {
  const stub = alternateStructureListStub(parentDetail, skin)
  const bracket = alternateStructureBracketRole(skin.name)
  const wikiRole = bracket
    ? bracketRoleToWikiRole(bracket, parentDetail.role)
    : overrideRole.trim() || stub.role || parentDetail.role
  return {
    digimonId: stub.id,
    digimonName: stub.name,
    iconId,
    wikiRole,
    parentDigimonId: parentDetail.id,
    isAlternateStructure: true,
  }
}

function normalizeParentPortraitIcon(
  parentDetail: WikiDigimonDetail,
  iconId: string | null,
  parentModelId: string,
): string | null {
  if (!iconId) return parentModelId || parentDetail.model_id?.trim() || null
  const parentDefault = parentModelId || parentDetail.model_id?.trim() || ''
  if (!parentDefault || iconId === parentDefault) return iconId
  if (findAlternateStructureSkinByIcon(parentDetail, iconId)) return parentDefault
  return iconId
}

function parentIdentity(
  parentDetail: WikiDigimonDetail,
  fallbackName: string,
  iconId: string | null,
  parentRole: string,
  parentModelId = '',
): EffectiveDigimonIdentity {
  return {
    digimonId: parentDetail.id,
    digimonName: parentDetail.name || fallbackName,
    iconId: normalizeParentPortraitIcon(parentDetail, iconId, parentModelId),
    wikiRole: parentRole || parentDetail.role,
    isAlternateStructure: false,
  }
}

function alternateStructureSkillScore(
  memberSkillKeys: string[],
  recordedSkillNames: string[],
  parentDetail: WikiDigimonDetail,
  overrideDetail: WikiDigimonDetail,
): number {
  if (!memberSkillKeys.length && !recordedSkillNames.length) return 0

  const parentSkills = wikiSkillKeySet(parentDetail)
  const overrideSkills = wikiSkillKeySet(overrideDetail)
  const parentNames = wikiSkillNameSet(parentDetail)
  const overrideNames = wikiSkillNameSet(overrideDetail)
  const usedNames = collectUsedSkillNames(
    memberSkillKeys,
    recordedSkillNames,
    parentDetail,
    overrideDetail,
  )

  let parentKeyExclusive = 0
  let overrideKeyExclusive = 0
  let overrideKeyHits = 0
  let parentKeyHits = 0

  for (const key of memberSkillKeys) {
    const inParent = parentSkills.has(key)
    const inOverride = overrideSkills.has(key)
    if (inParent) parentKeyHits += 1
    if (inOverride) overrideKeyHits += 1
    if (inParent && !inOverride) parentKeyExclusive += 1
    if (inOverride && !inParent) overrideKeyExclusive += 1
  }

  let parentNameExclusive = 0
  let overrideNameExclusive = 0
  for (const name of usedNames) {
    const inParent = parentNames.has(name)
    const inOverride = overrideNames.has(name)
    if (inParent && !inOverride) parentNameExclusive += 1
    if (inOverride && !inParent) overrideNameExclusive += 1
  }

  // EventStream peer skill *names* are authoritative for same-model alts
  // (Alphamon Ouryuken tank: "Seiken Grandalpha", "Royal Aegis", "Digicode Bastion").
  // Parent skill ids can still lie on party_skill, so name exclusivity wins.
  if (overrideNameExclusive > parentNameExclusive) {
    return overrideNameExclusive - parentNameExclusive
  }
  if (overrideNameExclusive > 0 && parentNameExclusive === 0) {
    return overrideNameExclusive
  }

  if (overrideKeyExclusive > parentKeyExclusive) return overrideKeyExclusive - parentKeyExclusive
  if (overrideKeyExclusive > 0 && parentKeyExclusive === 0) return overrideKeyExclusive
  // All recorded skill ids belong to the override kit (and none are parent-only).
  if (overrideKeyHits > 0 && parentKeyExclusive === 0 && overrideKeyHits >= parentKeyHits) {
    return overrideKeyHits
  }
  return 0
}

function skillsSupportAlternateStructure(
  memberSkillKeys: string[],
  recordedSkillNames: string[],
  parentDetail: WikiDigimonDetail,
  overrideDetail: WikiDigimonDetail,
): boolean {
  return (
    alternateStructureSkillScore(
      memberSkillKeys,
      recordedSkillNames,
      parentDetail,
      overrideDetail,
    ) > 0
  )
}

async function findBestAlternateStructureSkinBySkills(
  parentDetail: WikiDigimonDetail,
  memberSkillKeys: string[],
  recordedSkillNames: string[],
): Promise<WikiDigimonSkin | null> {
  let best: { skin: WikiDigimonSkin; score: number } | null = null
  for (const skin of parentDetail.skins ?? []) {
    if (!isAlternateStructureSkin(skin)) continue
    const overrideId = (skin.override_id ?? '').trim()
    if (!overrideId) continue
    const overrideDetail = await fetchParentDetail(overrideId)
    if (!overrideDetail) continue
    const score = alternateStructureSkillScore(
      memberSkillKeys,
      recordedSkillNames,
      parentDetail,
      overrideDetail,
    )
    if (score <= 0) continue
    if (!best || score > best.score) best = { skin, score }
  }
  return best?.skin ?? null
}

async function fetchParentDetail(parentDigimonId: string): Promise<WikiDigimonDetail | null> {
  const cached = parentDetailCache.get(parentDigimonId)
  if (cached) return cached
  try {
    const detail = await fetchDigimonDetail(parentDigimonId)
    parentDetailCache.set(parentDigimonId, detail)
    return detail
  } catch {
    return null
  }
}

/**
 * When the companion keeps the parent `digimon_id` but swaps portrait `icon_id` for an
 * Alternate Structure Module, resolve the effective species id, display name, and role.
 *
 * Same-model alts (Alphamon Ouryuken / Mastemon / Omegamon / Ulforce X) are proven via
 * skill kit — prefer EventStream skill *names* when peer skill ids still point at parent.
 */
export async function resolveEffectiveDigimonIdentity(params: {
  digimonId: string
  iconId?: string | null
  digimonName?: string | null
  parentModelId?: string | null
  skillKeys?: string[] | null
  /** Raw skill display names from companion / EventStream (authoritative for peer alts). */
  skillNames?: string[] | null
}): Promise<EffectiveDigimonIdentity> {
  const digimonId = params.digimonId.trim()
  const iconId = params.iconId?.trim() || null
  const fallbackName = params.digimonName?.trim() || digimonId
  const skillKeys = (params.skillKeys ?? [])
    .map((key) => normalizeSkillKey(key))
    .filter((key): key is string => Boolean(key))
  const skillNames = (params.skillNames ?? [])
    .map((name) => normalizeSkillName(name))
    .filter((name): name is string => Boolean(name))

  if (!digimonId) {
    return {
      digimonId: '',
      digimonName: fallbackName,
      iconId,
      wikiRole: '',
      isAlternateStructure: false,
    }
  }

  const cacheKey = alternateResolutionCacheKey(digimonId, iconId ?? '', skillKeys, skillNames)
  const cached = alternateResolutionCache.get(cacheKey)
  if (cached) return cached

  let catalog = await fetchWikiDigimonCatalog()
  const parentEntry = catalog.get(digimonId)
  const parentModelId = params.parentModelId?.trim() || parentEntry?.modelId?.trim() || ''

  const parentDetail = await fetchParentDetail(digimonId)
  if (!parentDetail) {
    return {
      digimonId,
      digimonName: parentEntry?.name || fallbackName,
      iconId,
      wikiRole: parentEntry?.role || '',
      isAlternateStructure: false,
    }
  }

  const effectiveParentModelId = parentModelId || parentDetail.model_id?.trim() || ''
  const usingDefaultPortrait = !iconId || (effectiveParentModelId && iconId === effectiveParentModelId)

  let matchedSkin: WikiDigimonSkin | null = null
  let matchedByIcon = false
  if (!usingDefaultPortrait && iconId) {
    matchedSkin = findAlternateStructureSkinByIcon(parentDetail, iconId)
    matchedByIcon = Boolean(matchedSkin)
  }
  if (!matchedSkin && (skillKeys.length || skillNames.length)) {
    matchedSkin = await findBestAlternateStructureSkinBySkills(
      parentDetail,
      skillKeys,
      skillNames,
    )
  }

  if (matchedSkin?.override_id?.trim()) {
    const overrideDetail = await fetchParentDetail(matchedSkin.override_id.trim())
    const skinIcon = (matchedSkin.override_model ?? matchedSkin.model_id ?? '').trim()
    const resolvedIcon = iconId || skinIcon || null
    // Distinct-model skins can be trusted from portrait alone. Same-model alts
    // (Mastemon / Alphamon Ouryuken / Omegamon / Ulforce X) must prove via skill kit.
    const skillsOk = Boolean(
      overrideDetail &&
        skillsSupportAlternateStructure(skillKeys, skillNames, parentDetail, overrideDetail),
    )
    if (overrideDetail && (matchedByIcon || skillsOk)) {
      const resolved = identityFromSkin(
        parentDetail,
        matchedSkin,
        resolvedIcon || iconId || skinIcon,
        overrideDetail.role ?? '',
      )
      alternateResolutionCache.set(cacheKey, resolved)
      catalog = await fetchWikiDigimonCatalog()
      if (!catalog.has(resolved.digimonId)) {
        catalog.set(resolved.digimonId, {
          name: resolved.digimonName,
          modelId: resolved.iconId || skinIcon,
          role: resolved.wikiRole,
        })
      }
      return resolved
    }
  }

  const resolved = parentIdentity(
    parentDetail,
    fallbackName,
    iconId,
    parentEntry?.role || parentDetail.role,
    effectiveParentModelId,
  )
  alternateResolutionCache.set(cacheKey, resolved)
  return resolved
}

/** @internal Test helper */
export function clearAlternateStructureResolverCache(): void {
  alternateResolutionCache.clear()
  parentDetailCache.clear()
}

/** @internal Test helper */
export function primeAlternateStructureIconCache(
  iconId: string,
  identity: EffectiveDigimonIdentity,
): void {
  if (!iconId.trim()) return
  alternateResolutionCache.set(`${identity.digimonId}|${iconId.trim()}||`, {
    ...identity,
    iconId: iconId.trim(),
  })
}
