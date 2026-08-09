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

function normalizeSkillName(name: string | null | undefined): string | null {
  const n = (name ?? '').trim().toLowerCase()
  if (!n || n === 'auto attack' || n === '(basic)') return null
  return n
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
    const name = normalizeSkillName(skill.name)
    if (name) set.add(name)
  }
  return set
}

function wikiSkillKeyToNameMap(detail: WikiDetail): Map<string, string> {
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
  parentDetail: WikiDetail,
  overrideDetail: WikiDetail,
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
  const tag = bracket.trim().toLowerCase().replace(/\s+/g, ' ')
  if (tag === 'healer' || tag === 'support') return 'Support'
  if (tag === 'tank') return 'Tank'
  if (tag === 'caster') return 'Caster'
  if (tag === 'hybrid') return 'Hybrid'
  if (tag === 'melee' || tag === 'melee dps') return 'Melee DPS'
  if (tag === 'ranged' || tag === 'ranged dps') return 'Ranged DPS'
  if (tag === 'dps') {
    const parent = normalizeWikiRole(parentRole)
    if (parent.includes('ranged')) return 'Ranged DPS'
    if (parent.includes('melee')) return 'Melee DPS'
    return 'Melee DPS'
  }
  return bracket.trim()
}

function identityFromSkin(
  parentDetail: WikiDetail,
  skin: WikiSkin,
  iconId: string,
  overrideRole = '',
): ResolvedAlternate {
  const bracket = alternateStructureBracketRole(skin.name)
  const wikiRole = bracket
    ? bracketRoleToWikiRole(bracket, String(parentDetail.role ?? ''))
    : overrideRole.trim() || String(parentDetail.role ?? '')
  return {
    digimonId: (skin.override_id ?? '').trim(),
    digimonName: (skin.override_name ?? skin.name ?? parentDetail.name ?? '').trim(),
    iconId,
    wikiRole,
    parentDigimonId: parentDetail.id,
    isAlternateStructure: true,
  }
}

/** True when icon matches any wiki skin model (cosmetic AVM or alternate structure). */
function findSkinModelIcon(detail: WikiDetail, iconId: string): boolean {
  const icon = iconId.trim()
  if (!icon) return false
  for (const skin of detail.skins ?? []) {
    const skinIcon = (skin.override_model ?? skin.model_id ?? '').trim()
    if (skinIcon && skinIcon === icon) return true
    if ((skin.model_id ?? '').trim() === icon) return true
  }
  return false
}

function normalizeParentPortraitIcon(
  parentDetail: WikiDetail,
  iconId: string | null,
  parentModelId: string,
): string | null {
  if (!iconId) return parentModelId || (parentDetail.model_id ?? '').trim() || null
  const parentDefault = parentModelId || (parentDetail.model_id ?? '').trim()
  if (!parentDefault || iconId === parentDefault) return iconId
  // Cosmetic AVM skins (Neon Rebellion Omegamon, etc.) and alt-structure skins often use
  // model ids that are not hosted on the CDN. Leaderboard portraits should use the wiki parent.
  if (findSkinModelIcon(parentDetail, iconId) || findAlternateStructureSkinByIcon(parentDetail, iconId)) {
    return parentDefault
  }
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
  recordedSkillNames: string[],
  parentDetail: WikiDetail,
  overrideDetail: WikiDetail,
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

  let overrideNameExclusive = 0
  for (const name of usedNames) {
    const inParent = parentNames.has(name)
    const inOverride = overrideNames.has(name)
    if (inOverride && !inParent) overrideNameExclusive += 1
  }

  // Any alternate-structure-exclusive skill selects the alt role — even when the
  // parent kit is also present (peer party_skill often emits parent ids/names too).
  if (overrideNameExclusive > 0) return overrideNameExclusive
  if (overrideKeyExclusive > 0) return overrideKeyExclusive
  if (overrideKeyHits > 0 && parentKeyExclusive === 0 && overrideKeyHits >= parentKeyHits) {
    return overrideKeyHits
  }
  return 0
}

function skillsSupportAlternateStructure(
  memberSkillKeys: string[],
  recordedSkillNames: string[],
  parentDetail: WikiDetail,
  overrideDetail: WikiDetail,
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
  parentDetail: WikiDetail,
  memberSkillKeys: string[],
  recordedSkillNames: string[],
): Promise<WikiSkin | null> {
  let best: { skin: WikiSkin; score: number } | null = null
  for (const skin of parentDetail.skins ?? []) {
    if (!isAlternateStructureSkin(skin)) continue
    const overrideId = (skin.override_id ?? '').trim()
    if (!overrideId) continue
    const overrideDetail = await fetchWikiDetail(overrideId)
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

export async function fetchWikiDetail(digimonId: string): Promise<WikiDetail | null> {
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

/** Override digimon ids linked from Alternate Structure Module skins on a parent. */
export function collectAlternateStructureOverrideIds(detail: WikiDetail): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const skin of detail.skins ?? []) {
    if (!isAlternateStructureSkin(skin)) continue
    const overrideId = (skin.override_id ?? '').trim()
    if (!overrideId || seen.has(overrideId)) continue
    seen.add(overrideId)
    ids.push(overrideId)
  }
  return ids
}

export async function resolveEffectiveDigimonIdentity(params: {
  digimonId: string
  iconId?: string | null
  digimonName?: string | null
  parentModelId?: string | null
  parentName?: string | null
  parentRole?: string | null
  skillKeys?: string[] | null
  skillNames?: string[] | null
}): Promise<EffectiveDigimonIdentity> {
  const digimonId = params.digimonId.trim()
  const iconId = params.iconId?.trim() || null
  const fallbackName = params.digimonName?.trim() || params.parentName?.trim() || digimonId
  const parentRole = params.parentRole?.trim() || ''
  const parentModelId = params.parentModelId?.trim() || ''
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
      wikiRole: parentRole,
      isAlternateStructure: false,
    }
  }

  const cacheKey = alternateResolutionCacheKey(digimonId, iconId ?? '', skillKeys, skillNames)
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
    const overrideDetail = await fetchWikiDetail(matchedSkin.override_id.trim())
    const skinIcon = (matchedSkin.override_model ?? matchedSkin.model_id ?? '').trim()
    const resolvedIcon = iconId || skinIcon || null
    const skillsOk = Boolean(
      overrideDetail &&
        skillsSupportAlternateStructure(skillKeys, skillNames, parentDetail, overrideDetail),
    )
    if (overrideDetail && (matchedByIcon || skillsOk)) {
      const resolved = identityFromSkin(
        parentDetail,
        matchedSkin,
        resolvedIcon || iconId || skinIcon,
        String(overrideDetail.role ?? ''),
      )
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
