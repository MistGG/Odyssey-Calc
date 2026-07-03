const WIKI_DIGIMON_DETAIL_URL =
  Deno.env.get('WIKI_DIGIMON_DETAIL_URL')?.trim() ||
  'https://odyssey-proxy.qawsar-ahmed.workers.dev/proxy/api/wiki/digimon'

const ALTERNATE_STRUCTURE_MODULE_PREFIX = 'Alternate Structure Module'

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

const alternateByIconCache = new Map<string, ResolvedAlternate>()
const parentDetailCache = new Map<string, WikiDetail>()

function normalizeWikiRole(role: string | null | undefined): string {
  return (role ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
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

async function fetchParentDetail(parentDigimonId: string): Promise<WikiDetail | null> {
  const cached = parentDetailCache.get(parentDigimonId)
  if (cached) return cached
  try {
    const join = WIKI_DIGIMON_DETAIL_URL.includes('?') ? '&' : '?'
    const url = `${WIKI_DIGIMON_DETAIL_URL}${join}id=${encodeURIComponent(parentDigimonId)}`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const detail = (await res.json()) as WikiDetail
    parentDetailCache.set(parentDigimonId, detail)
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
}): Promise<EffectiveDigimonIdentity> {
  const digimonId = params.digimonId.trim()
  const iconId = params.iconId?.trim() || null
  const fallbackName = params.digimonName?.trim() || params.parentName?.trim() || digimonId
  const parentRole = params.parentRole?.trim() || ''
  const parentModelId = params.parentModelId?.trim() || ''

  if (!digimonId) {
    return {
      digimonId: '',
      digimonName: fallbackName,
      iconId,
      wikiRole: parentRole,
      isAlternateStructure: false,
    }
  }

  if (!iconId || (parentModelId && iconId === parentModelId)) {
    return {
      digimonId,
      digimonName: fallbackName,
      iconId,
      wikiRole: parentRole,
      isAlternateStructure: false,
    }
  }

  const cached = alternateByIconCache.get(iconId)
  if (cached) return cached

  const parentDetail = await fetchParentDetail(digimonId)
  if (!parentDetail) {
    return {
      digimonId,
      digimonName: fallbackName,
      iconId,
      wikiRole: parentRole,
      isAlternateStructure: false,
    }
  }

  const skin = findAlternateStructureSkinByIcon(parentDetail, iconId)
  if (!skin?.override_id?.trim()) {
    return {
      digimonId,
      digimonName: fallbackName,
      iconId,
      wikiRole: parentRole || String(parentDetail.role ?? ''),
      isAlternateStructure: false,
    }
  }

  const resolved = identityFromSkin(parentDetail, skin, iconId)
  alternateByIconCache.set(iconId, resolved)
  return resolved
}
