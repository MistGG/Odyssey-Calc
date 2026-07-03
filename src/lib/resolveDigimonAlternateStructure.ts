import { fetchDigimonDetail } from '../api/digimonService'
import type { WikiDigimonDetail, WikiDigimonSkin } from '../types/wikiApi'
import {
  alternateStructureBracketRole,
  alternateStructureListStub,
  findAlternateStructureSkinByIcon,
} from './digimonAlternateStructure'
import { normalizeWikiRole } from './digimonRoleSkills'
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

const alternateByIconCache = new Map<string, ResolvedAlternate>()
const parentDetailCache = new Map<string, WikiDigimonDetail>()

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

function identityFromSkin(
  parentDetail: WikiDigimonDetail,
  skin: WikiDigimonSkin,
  iconId: string,
): ResolvedAlternate {
  const stub = alternateStructureListStub(parentDetail, skin)
  const bracket = alternateStructureBracketRole(skin.name)
  const wikiRole = bracket
    ? bracketRoleToWikiRole(bracket, parentDetail.role)
    : stub.role || parentDetail.role
  return {
    digimonId: stub.id,
    digimonName: stub.name,
    iconId,
    wikiRole,
    parentDigimonId: parentDetail.id,
    isAlternateStructure: true,
  }
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
 */
export async function resolveEffectiveDigimonIdentity(params: {
  digimonId: string
  iconId?: string | null
  digimonName?: string | null
  parentModelId?: string | null
}): Promise<EffectiveDigimonIdentity> {
  const digimonId = params.digimonId.trim()
  const iconId = params.iconId?.trim() || null
  const fallbackName = params.digimonName?.trim() || digimonId

  if (!digimonId) {
    return {
      digimonId: '',
      digimonName: fallbackName,
      iconId,
      wikiRole: '',
      isAlternateStructure: false,
    }
  }

  let catalog = await fetchWikiDigimonCatalog()
  const parentEntry = catalog.get(digimonId)
  const parentModelId = params.parentModelId?.trim() || parentEntry?.modelId?.trim() || ''

  if (!iconId || (parentModelId && iconId === parentModelId)) {
    return {
      digimonId,
      digimonName: parentEntry?.name || fallbackName,
      iconId,
      wikiRole: parentEntry?.role || '',
      isAlternateStructure: false,
    }
  }

  const cached = alternateByIconCache.get(iconId)
  if (cached) return cached

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

  const skin = findAlternateStructureSkinByIcon(parentDetail, iconId)
  if (!skin?.override_id?.trim()) {
    return {
      digimonId,
      digimonName: parentEntry?.name || fallbackName,
      iconId,
      wikiRole: parentEntry?.role || '',
      isAlternateStructure: false,
    }
  }

  const resolved = identityFromSkin(parentDetail, skin, iconId)
  alternateByIconCache.set(iconId, resolved)
  catalog = await fetchWikiDigimonCatalog()
  if (!catalog.has(resolved.digimonId)) {
    catalog.set(resolved.digimonId, {
      name: resolved.digimonName,
      modelId: iconId,
      role: resolved.wikiRole,
    })
  }
  return resolved
}

/** @internal Test helper */
export function clearAlternateStructureResolverCache(): void {
  alternateByIconCache.clear()
  parentDetailCache.clear()
}

/** @internal Test helper */
export function primeAlternateStructureIconCache(
  iconId: string,
  identity: EffectiveDigimonIdentity,
): void {
  if (!iconId.trim()) return
  alternateByIconCache.set(iconId.trim(), { ...identity, iconId: iconId.trim() })
}
