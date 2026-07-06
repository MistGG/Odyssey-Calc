const WIKI_DIGIMON_DETAIL_URL =
  Deno.env.get('WIKI_DIGIMON_DETAIL_URL')?.trim() ||
  'https://odyssey-proxy.qawsar-ahmed.workers.dev/proxy/api/wiki/digimon'

const ALTERNATE_STRUCTURE_MODULE_PREFIX = 'Alternate Structure Module'

type WikiSkill = {
  id?: string
  name?: string
}

type WikiSkin = {
  name?: string
  model_id?: string
  override_id?: string
  override_name?: string
  override_model?: string
  unlock_item_name?: string
}

type WikiDetail = {
  id?: string
  name?: string
  role?: string
  model_id?: string
  skills?: WikiSkill[]
  skins?: WikiSkin[]
}

export type EffectiveDigimonIdentity = {
  digimonId: string
  digimonName: string
  iconId: string | null
  wikiRole: string
  parentDigimonId?: string
  isAlternateStructure: boolean
}

type ResolvedAlternate = EffectiveDigimonIdentity & { iconId: string }

const alternateResolutionCache = new Map<string, EffectiveDigimonIdentity>()
const parentDetailCache = new Map<string, WikiDetail>()

function normalizeWikiRole(role: string | null | undefined): string {
  return (role ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function normalizeSkillKey(key: string | null | undefined): string | null {
  const k = (key ?? '').trim().toLowerCase()
  if (!k || k === '(basic)') return null
  return k
}

function wikiSkillKeySet(detail: WikiDetail): Set<string> {
  const set = new Set<string>()
  for (const skill of detail.skills ?? []) {
    const key = normalizeSkillKey(skill.id)
    if (key) set.add(key)
  }
  return set
}

function wikiSkillNameSet(detail: WikiDetail): Set<string> {
  const set = new Set<string>()
  for (const skill of detail.skills ?? []) {
    const name = skill.name?.trim().toLowerCase()
    if (name) set.add(name)
  }
  return set
}

function wikiSkillKeyToNameMap(detail: WikiDetail): Map<string, string> {
  const map = new Map<string, string>()
  for (const skill of detail.skills ?? []) {
    const key = normalizeSkillKey(skill.id)
    const name = skill.name?.trim().toLowerCase()
    if (key && name) map.set(key, name)
  }
  return map
}

function memberSkillNames(
  memberSkillKeys: string[],
  parentDetail: WikiDetail,
  overrideDetail: WikiDetail,
): Set<string> {
  const parentMap = wikiSkillKeyToNameMap(parentDetail)
  const overrideMap = wikiSkillKeyToNameMap(overrideDetail)
  const names = new Set<string>()
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
): string {
  return `${parentDigimonId}|${iconId}|${[...skillKeys].sort().join(',')}`
}

function isAlternateStructureSkin(skin: WikiSkin): boolean {
  const unlockName = (skin.unlock_item_name ?? '').trim()
  return new RegExp(`^${ALTERNATE_STRUCTURE_MODULE_PREFIX}\\b`, 'i').test(unlockName)
}

function alternateStructureBracketRole(skinName: string | null | undefined): string | null {
  const match = /^\[(.+?)\]\s/.exec((skinName ?? '').trim())
  return match?.[1]?.trim() || null
}

function findAlternateStructureSkinByIcon(detail: WikiDetail, iconId: string): WikiSkin | null {
  const icon = iconId.trim()
  if (!icon) return null
  const parentModelId = (detail.model_id ?? '').trim()
  if (icon === parentModelId) return null
  for (const skin of detail.skins ?? []) {
    if (!isAlternateStructureSkin(skin)) continue
    const skinIcon = (skin.override_model ?? skin.model_id ?? '').trim()
    if (skinIcon && skinIcon === icon) return skin
  }
  return null
}

function bracketRoleToWikiRole(bracket: string, parentRole: string): string {
  const tag = bracket.trim().toLowerCase()
  if (tag === 'healer') return 'Support'
  if (tag === 'tank') return 'Tank'
  if (tag === 'caster') return 'Caster'
  if (tag === 'hybrid') return 'Hybrid'
  if (tag === 'dps') {
    const parent = normalizeWikiRole(parentRole)
    if (parent.includes('ranged')) return 'Ranged DPS'
    if (parent.includes('melee')) return 'Melee DPS'
    return 'Melee DPS'
  }
  return bracket
}

function identityFromSkin(parentDetail: WikiDetail, skin: WikiSkin, iconId: string): ResolvedAlternate {
  const bracket = alternateStructureBracketRole(skin.name)
  const wikiRole = bracket
    ? bracketRoleToWikiRole(bracket, String(parentDetail.role ?? ''))
    : String(parentDetail.role ?? '')
  return {
    digimonId: (skin.override_id ?? '').trim(),
    digimonName: (skin.override_name ?? skin.name ?? parentDetail.name ?? '').trim(),
    iconId,
    wikiRole,
    parentDigimonId: parentDetail.id,
    isAlternateStructure: true,
  }
}

function normalizeParentPortraitIcon(
  parentDetail: WikiDetail,
  iconId: string | null,
  parentModelId: string,
): string | null {
  if (!iconId) return parentModelId || (parentDetail.model_id ?? '').trim() || null
  const parentDefault = parentModelId || (parentDetail.model_id ?? '').trim()
  if (!parentDefault || iconId === parentDefault) return iconId
  if (findAlternateStructureSkinByIcon(parentDetail, iconId)) return parentDefault
  return iconId
}

function parentIdentity(
  parentDetail: WikiDetail,
  fallbackName: string,
  iconId: string | null,
  parentRole: string,
  parentModelId = '',
): EffectiveDigimonIdentity {
  return {
    digimonId: String(parentDetail.id ?? '').trim(),
    digimonName: String(parentDetail.name ?? '').trim() || fallbackName,
    iconId: normalizeParentPortraitIcon(parentDetail, iconId, parentModelId),
    wikiRole: parentRole || String(parentDetail.role ?? ''),
    isAlternateStructure: false,
  }
}

function alternateStructureSkillScore(
  memberSkillKeys: string[],
  parentDetail: WikiDetail,
  overrideDetail: WikiDetail,
): number {
  if (!memberSkillKeys.length) return 0

  const parentSkills = wikiSkillKeySet(parentDetail)
  const overrideSkills = wikiSkillKeySet(overrideDetail)
  const parentNames = wikiSkillNameSet(parentDetail)
  const overrideNames = wikiSkillNameSet(overrideDetail)
  const usedNames = memberSkillNames(memberSkillKeys, parentDetail, overrideDetail)

  let parentExclusive = 0
  let overrideExclusive = 0

  for (const key of memberSkillKeys) {
    const inParent = parentSkills.has(key)
    const inOverride = overrideSkills.has(key)
    if (inParent && !inOverride) parentExclusive += 1
    if (inOverride && !inParent) overrideExclusive += 1
  }

  for (const name of usedNames) {
    const inParent = parentNames.has(name)
    const inOverride = overrideNames.has(name)
    if (inParent && !inOverride) parentExclusive += 1
    if (inOverride && !inParent) overrideExclusive += 1
  }

  if (parentExclusive > 0) return 0
  return overrideExclusive
}

function skillsSupportAlternateStructure(
  memberSkillKeys: string[],
  parentDetail: WikiDetail,
  overrideDetail: WikiDetail,
): boolean {
  return alternateStructureSkillScore(memberSkillKeys, parentDetail, overrideDetail) > 0
}

async function findBestAlternateStructureSkinBySkills(
  parentDetail: WikiDetail,
  memberSkillKeys: string[],
): Promise<WikiSkin | null> {
  let best: { skin: WikiSkin; score: number } | null = null
  for (const skin of parentDetail.skins ?? []) {
    if (!isAlternateStructureSkin(skin)) continue
    const overrideId = (skin.override_id ?? '').trim()
    if (!overrideId) continue
    const overrideDetail = await fetchWikiDetail(overrideId)
    if (!overrideDetail) continue
    const score = alternateStructureSkillScore(memberSkillKeys, parentDetail, overrideDetail)
    if (score <= 0) continue
    if (!best || score > best.score) best = { skin, score }
  }
  return best?.skin ?? null
}

async function fetchWikiDetail(digimonId: string): Promise<WikiDetail | null> {
  const cached = parentDetailCache.get(digimonId)
  if (cached) return cached
  try {
    const join = WIKI_DIGIMON_DETAIL_URL.includes('?') ? '&' : '?'
    const url = `${WIKI_DIGIMON_DETAIL_URL}${join}id=${encodeURIComponent(digimonId)}`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const detail = (await res.json()) as WikiDetail
    parentDetailCache.set(digimonId, detail)
    return detail
  } catch {
    return null
  }
}

export async function resolveEffectiveDigimonIdentity(params: {
  digimonId: string
  iconId?: string | null
  digimonName?: string | null
  parentModelId?: string | null
  parentName?: string | null
  parentRole?: string | null
  skillKeys?: string[] | null
}): Promise<EffectiveDigimonIdentity> {
  const digimonId = params.digimonId.trim()
  const iconId = params.iconId?.trim() || null
  const fallbackName = params.digimonName?.trim() || params.parentName?.trim() || digimonId
  const parentRole = params.parentRole?.trim() || ''
  const parentModelId = params.parentModelId?.trim() || ''
  const skillKeys = (params.skillKeys ?? [])
    .map((key) => normalizeSkillKey(key))
    .filter((key): key is string => Boolean(key))

  if (!digimonId) {
    return {
      digimonId: '',
      digimonName: fallbackName,
      iconId,
      wikiRole: parentRole,
      isAlternateStructure: false,
    }
  }

  const cacheKey = alternateResolutionCacheKey(digimonId, iconId ?? '', skillKeys)
  const cached = alternateResolutionCache.get(cacheKey)
  if (cached) return cached

  const parentDetail = await fetchWikiDetail(digimonId)
  if (!parentDetail) {
    return {
      digimonId,
      digimonName: fallbackName,
      iconId,
      wikiRole: parentRole,
      isAlternateStructure: false,
    }
  }

  const effectiveParentModelId = parentModelId || (parentDetail.model_id ?? '').trim()
  const usingDefaultPortrait = !iconId || (effectiveParentModelId && iconId === effectiveParentModelId)

  let matchedSkin: WikiSkin | null = null
  if (!usingDefaultPortrait && iconId) {
    matchedSkin = findAlternateStructureSkinByIcon(parentDetail, iconId)
  }
  if (!matchedSkin && skillKeys.length) {
    matchedSkin = await findBestAlternateStructureSkinBySkills(parentDetail, skillKeys)
  }

  if (matchedSkin?.override_id?.trim()) {
    const overrideDetail = await fetchWikiDetail(matchedSkin.override_id.trim())
    const skinIcon = (matchedSkin.override_model ?? matchedSkin.model_id ?? '').trim()
    const resolvedIcon = iconId || skinIcon || null
    if (
      overrideDetail &&
      skillsSupportAlternateStructure(skillKeys, parentDetail, overrideDetail)
    ) {
      const resolved = identityFromSkin(parentDetail, matchedSkin, resolvedIcon || iconId || skinIcon)
      alternateResolutionCache.set(cacheKey, resolved)
      return resolved
    }
  }

  const resolved = parentIdentity(
    parentDetail,
    fallbackName,
    iconId,
    parentRole || String(parentDetail.role ?? ''),
    effectiveParentModelId,
  )
  alternateResolutionCache.set(cacheKey, resolved)
  return resolved
}
