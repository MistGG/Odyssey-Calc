import type { WikiDigimonDetail, WikiDigimonListItem, WikiDigimonSkin } from '../types/wikiApi'

/** Wiki unlock item prefix for skins that replace a Digimon's combat structure (separate tier-list entry). */
export const ALTERNATE_STRUCTURE_MODULE_PREFIX = 'Alternate Structure Module'

export function isAlternateStructureSkin(skin: WikiDigimonSkin): boolean {
  const unlockName = (skin.unlock_item_name ?? '').trim()
  // e.g. "Alternate Structure Module" or "Alternate Structure Module (Ornismon)"
  return new RegExp(`^${ALTERNATE_STRUCTURE_MODULE_PREFIX}\\b`, 'i').test(unlockName)
}

/** Bracket role tag on alternate structure skins, e.g. `[HEALER] White Gale Ornismon`. */
export function alternateStructureBracketRole(skinName: string | null | undefined): string | null {
  const match = /^\[(.+?)\]\s/.exec((skinName ?? '').trim())
  return match?.[1]?.trim() || null
}

/** Match an in-game portrait `icon_id` to an alternate structure skin on a parent detail payload. */
export function findAlternateStructureSkinByIcon(
  detail: WikiDigimonDetail,
  iconId: string,
): WikiDigimonSkin | null {
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

/** Override Digimon ids from Alternate Structure Module skins on a detail payload. */
export function collectAlternateStructureOverrideIds(detail: WikiDigimonDetail): string[] {
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

export function wikiDigimonListItemFromDetail(detail: WikiDigimonDetail): WikiDigimonListItem {
  return {
    id: detail.id,
    name: detail.name,
    model_id: detail.model_id,
    stage: detail.stage,
    attribute: detail.attribute,
    element: detail.element,
    role: detail.role,
    family_types: detail.family_types ?? [],
    rank: detail.rank,
    hp: detail.hp,
    attack: detail.attack,
  }
}

export function digimonListSignature(d: WikiDigimonListItem): string {
  return [
    d.id,
    d.name,
    d.model_id,
    d.stage,
    d.attribute,
    d.element,
    d.role,
    d.rank,
    d.hp,
    d.attack,
    (d.family_types ?? []).join(','),
  ].join('|')
}

/** Best-effort list row before the override detail fetch completes. */
export function alternateStructureListStub(
  parent: WikiDigimonDetail,
  skin: WikiDigimonSkin,
): WikiDigimonListItem {
  const roleMatch = /^\[(.+?)\]\s/.exec(skin.name ?? '')
  return {
    id: skin.override_id ?? '',
    name: skin.override_name ?? skin.name,
    model_id: skin.override_model ?? skin.model_id,
    stage: skin.stage ?? parent.stage,
    attribute: parent.attribute,
    element: parent.element,
    role: roleMatch?.[1] ?? parent.role,
    family_types: parent.family_types ?? [],
    rank: parent.rank,
    hp: parent.hp,
    attack: parent.attack,
  }
}

export function upsertListMetaFromDetail(
  detail: WikiDigimonDetail,
  meta: Record<string, WikiDigimonListItem>,
  signatures: Record<string, string>,
): WikiDigimonListItem {
  const item = wikiDigimonListItemFromDetail(detail)
  meta[item.id] = item
  signatures[item.id] = digimonListSignature(item)
  return item
}
