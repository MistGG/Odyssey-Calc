/** Navigation tree and static copy for the guidebook. */

export type GuidebookNavChild = {
  id: string
  title: string
}

export type GuidebookNavChapter = {
  id: string
  title: string
  children?: GuidebookNavChild[]
}

export const OFFICIAL_BEGINNERS_GUIDE_URL =
  'https://docs.thedigitalodyssey.com/s/1ea1524b-2c7e-4369-9608-36acb1ef87b0/doc/digital-odysseys-guide-for-new-heroes-6Klf1mAAUf'

/** Agumon (Classic) — recommended starter in Early Game 1-50. */
export const GUIDEBOOK_AGUMON_CLASSIC_ID = 'dfwwn6s'

/** Mastemon's Report — File Island gate for Early Game 50-70. */
export const GUIDEBOOK_MASTEMON_REPORT_QUEST_ID = 'q1e0s4a0'

/** Hikari Sees Odaiba — level 70 uncap gate in Odaiba (Early Game 50-70). */
export const GUIDEBOOK_HIKARI_SEES_ODAIBA_QUEST_ID = 'q182jhml'

/** Level 50 uncap dungeon (Normal). */
export const GUIDEBOOK_UNCAP_50_DUNGEON_ID = 'u2ooqoe'

/** Level 70 uncap dungeon (Normal). */
export const GUIDEBOOK_UNCAP_70_DUNGEON_ID = 'urb9jgm'

/** The Dark Roar — EXP farm in Big Sight (Story). */
export const GUIDEBOOK_DARK_ROAR_DUNGEON_ID = 'uzyxsi2'

/** Homeostasis Wish — digivice material from raid ranking rewards (Gear → Digivice). */
export const GUIDEBOOK_HOMEOSTASIS_WISH_ITEM_ID = 'i1fgyfqa'

/** Ring Data: Golden Seadragon (Gear → Ring). */
export const GUIDEBOOK_RING_DATA_ITEM_ID = 'ib9xrv6'

/** Necklace Data variants (Gear → Necklace). */
export const GUIDEBOOK_NECKLACE_DATA_ITEM_IDS = ['i1rduvxy', 'i1361pdh'] as const

/** Keyring Data variants (Gear → Keyring). */
export const GUIDEBOOK_KEYRING_DATA_ITEM_IDS = ['i15re6xh', 'ia1e2ht'] as const

/** Gear drops that are character-bound (shown on dungeon loot rows). */
export const GUIDEBOOK_GEAR_CHARACTER_BOUND_ITEM_IDS = [
  'i15re6xh',
  'i1rduvxy',
  'iwswwcw',
  GUIDEBOOK_HOMEOSTASIS_WISH_ITEM_ID,
  GUIDEBOOK_RING_DATA_ITEM_ID,
] as const

/** Gear drops that are tradeable (shown on dungeon loot rows). */
export const GUIDEBOOK_GEAR_TRADEABLE_ITEM_IDS = ['ia1e2ht', 'i1361pdh', 'i8v0loc'] as const

/** Goggles Data variants (Gear → Goggles). */
export const GUIDEBOOK_GOGGLES_DATA_ITEM_IDS = ['i8v0loc', 'iwswwcw'] as const

/** Mastemon — turn-in NPC for Mastemon's Report. */
export const GUIDEBOOK_MASTEMON_NPC_ID = 'c1vmfiwu'

export const GUIDEBOOK_NAV: GuidebookNavChapter[] = [
  {
    id: 'beginners',
    title: 'Beginners Guide',
    children: [
      { id: 'beginners-preface', title: 'Preface' },
      { id: 'beginners-official', title: 'Official Guide' },
    ],
  },
  {
    id: 'early-game',
    title: 'Early Game',
    children: [
      { id: 'early-1-50', title: '1-50' },
      { id: 'early-50-70', title: '50-70' },
      { id: 'early-70-beyond', title: '70 and beyond' },
    ],
  },
  {
    id: 'mid-game',
    title: 'Mid Game',
    children: [
      { id: 'mid-farming-digimon', title: 'Farming a digimon' },
      { id: 'mid-cloning', title: 'Cloning' },
      { id: 'mid-seals', title: 'Seals' },
      { id: 'mid-raids', title: 'Raids' },
      { id: 'mid-digivice', title: 'Digivice' },
      { id: 'mid-clothes', title: 'Clothes' },
      { id: 'mid-ring', title: 'Ring' },
      { id: 'mid-necklace', title: 'Necklace' },
      { id: 'mid-goggles', title: 'Goggles' },
      { id: 'mid-keyring', title: 'Keyring' },
    ],
  },
]

/** All section ids valid for deep links (chapter headings + cards). */
export function guidebookLinkableSectionIds(): string[] {
  const ids: string[] = []
  for (const ch of GUIDEBOOK_NAV) {
    ids.push(ch.id)
    if (ch.children?.length) {
      for (const sub of ch.children) ids.push(sub.id)
    }
  }
  return ids
}

/** Ordered scroll-spy targets (deepest sections first for stable highlighting). */
export function guidebookScrollIds(): string[] {
  const ids: string[] = []
  for (const ch of GUIDEBOOK_NAV) {
    if (ch.children?.length) {
      for (const sub of ch.children) ids.push(sub.id)
    } else {
      ids.push(ch.id)
    }
  }
  return ids
}

export function guidebookChapterForSection(sectionId: string): string | null {
  for (const ch of GUIDEBOOK_NAV) {
    if (ch.id === sectionId) return ch.id
    if (ch.children?.some((c) => c.id === sectionId)) return ch.id
  }
  return null
}

export const ROLE_GUIDE: {
  role: string
  summary: string
  tips: string[]
}[] = [
  {
    role: 'Melee DPS',
    summary: 'Close range, steady damage.',
    tips: ['Stack attack and crit.', 'Learn boss dodge timings.'],
  },
  {
    role: 'Ranged DPS',
    summary: 'Safe distance damage.',
    tips: ['Hit rate matters on moving bosses.', 'Compare peers on Tier List before rerolling.'],
  },
  {
    role: 'Caster',
    summary: 'Skill-heavy, often DS hungry.',
    tips: ['Watch DS on long fights.', 'Test rotation order in Lab.'],
  },
  {
    role: 'Hybrid',
    summary: 'Mixed melee and skills.',
    tips: ['Check which skills scale off attack.', 'Gear is not one-size-fits-all.'],
  },
  {
    role: 'Tank',
    summary: 'Survivability for the party.',
    tips: ['Value is enabling clears, not topping DPS.', 'Meter still tracks you.'],
  },
  {
    role: 'Support',
    summary: 'Buffs, heals, utility.',
    tips: ['Browse support kits before committing.', 'Good buff uptime shows in Meter.'],
  },
]

/** Extended copy for in-page popups (cards / tiles). */
export type GuidebookDetail = {
  title: string
  lines: string[]
}

export const GUIDEBOOK_DETAILS: Record<string, GuidebookDetail> = {}
