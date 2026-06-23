import type { GuidebookSealCategory } from './guidebookSeals'

export type GuidebookOdysseySealPack = GuidebookSealCategory

/** Odyssey Seal Pack scan items (midgame). Sources load from wiki item raid_sources. */
export const GUIDEBOOK_ODYSSEY_SEAL_PACKS: readonly GuidebookOdysseySealPack[] = [
  {
    itemId: 'i1bbh9rp',
    boxTag: 'HP',
    sealStatId: 'hp',
    label: 'Max HP',
    itemName: 'Odyssey Seal Pack [HP]',
    iconId: 'nipjg96',
  },
  {
    itemId: 'i11f2q1e',
    boxTag: 'DS',
    sealStatId: 'ds',
    label: 'Max DS',
    itemName: 'Odyssey Seal Pack [DS]',
    iconId: 'nipjg96',
  },
  {
    itemId: 'in5rsqy',
    boxTag: 'AT',
    sealStatId: 'at',
    label: 'Attack',
    itemName: 'Odyssey Seal Pack [AT]',
    iconId: 'nd821v9',
  },
  {
    itemId: 'i1m1a140',
    boxTag: 'CT',
    sealStatId: 'ct',
    label: 'Crit Rate',
    itemName: 'Odyssey Seal Pack [CT]',
    iconId: 'nd821v9',
  },
  {
    itemId: 'i1pszkbs',
    boxTag: 'DE',
    sealStatId: 'de',
    label: 'Defense',
    itemName: 'Odyssey Seal Pack [DE]',
    iconId: 'n1h2x51',
  },
  {
    itemId: 'ikf9214',
    boxTag: 'HT',
    sealStatId: 'ht',
    label: 'Hit Rate',
    itemName: 'Odyssey Seal Pack [HT]',
    iconId: 'nd821v9',
  },
  {
    itemId: 'i1bhbaxz',
    boxTag: 'EV',
    sealStatId: 'ev',
    label: 'Evasion',
    itemName: 'Odyssey Seal Pack [EV]',
    iconId: 'n1h2x51',
  },
  {
    itemId: 'iozuiq5',
    boxTag: 'BL',
    sealStatId: 'bl',
    label: 'Block Rate',
    itemName: 'Odyssey Seal Pack [BL]',
    iconId: 'n1h2x51',
  },
] as const

export function guidebookOdysseySealPackCategories(): GuidebookOdysseySealPack[] {
  return [...GUIDEBOOK_ODYSSEY_SEAL_PACKS]
}

export const GUIDEBOOK_ODYSSEY_SEAL_PACK_ITEM_IDS = GUIDEBOOK_ODYSSEY_SEAL_PACKS.map((p) => p.itemId)
