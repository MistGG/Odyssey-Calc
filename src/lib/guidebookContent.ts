/** Wiki ids and shared guidebook copy. Progression lives in guidebookProgression.ts. */

export {
  OFFICIAL_BEGINNERS_GUIDE_URL,
  OFFICIAL_HEROES_GUIDE_URL,
  OFFICIAL_ZERO_TO_HERO_GUIDE_URL,
  GUIDEBOOK_PROGRESSION_STEPS,
} from './guidebookProgression'

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

/** The Undying — VenomVamdemon EXP farm (Story). */
export const GUIDEBOOK_UNDYING_EXP_DUNGEON_ID = 'u11u777w'

/** Homeostasis Wish — 5 required for digivice craft/upgrade. */
export const GUIDEBOOK_HOMEOSTASIS_WISH_ITEM_ID = 'i1fgyfqa'

export const GUIDEBOOK_DIGIVICE_HOMEOSTASIS_WISH_COUNT = 5

export type GuidebookDigiviceFragment = {
  id: string
  name: string
  iconId: string
}

/** Crest fragments for digivice recipe (10 each). */
export const GUIDEBOOK_DIGIVICE_FRAGMENT_EACH_COUNT = 10

export const GUIDEBOOK_DIGIVICE_FRAGMENTS: readonly GuidebookDigiviceFragment[] = [
  { id: 'i491wgt', name: 'Fragment of Courage', iconId: 'ns0mjf5' },
  { id: 'i1qr3bol', name: 'Fragment of Friendship', iconId: 'n1o1maoh' },
  { id: 'iumekga', name: 'Fragment of Hope', iconId: 'nc08rbo' },
  { id: 'i1loz604', name: 'Fragment of Knowledge', iconId: 'n1khrfxn' },
  { id: 'ih9i2ow', name: 'Fragment of Light', iconId: 'n14fjga4' },
  { id: 'i4i7y6j', name: 'Fragment of Love', iconId: 'n1ldfzgn' },
  { id: 'igwo9t7', name: 'Fragment of Reliability', iconId: 'nw825c9' },
  { id: 'ilxle91', name: 'Fragment of Sincerity', iconId: 'n1qg9ueq' },
]

/** Ring Data: Golden Seadragon (Gear → Ring). */
export const GUIDEBOOK_RING_DATA_ITEM_ID = 'ib9xrv6'

/** Dark DigiCore — corrupted ring craft (30 required). */
export const GUIDEBOOK_DARK_DIGICORE_ITEM_ID = 'i9ygivg'

export const GUIDEBOOK_CORRUPTED_RING_DARK_DIGICORE_COUNT = 30

/** Energized Dark DigiCore — corrupted ring craft (15 required). */
export const GUIDEBOOK_ENERGIZED_DARK_DIGICORE_ITEM_ID = 'i8vp49b'

export const GUIDEBOOK_CORRUPTED_RING_ENERGIZED_DIGICORE_COUNT = 15

/** Dark Masters Token — pity currency from Dark Master dungeons. */
export const GUIDEBOOK_DARK_MASTERS_TOKEN_ITEM_ID = 'itygv5a'

/** Exchange at Zudomon in Olympus: tokens → Dark DigiCore. */
export const GUIDEBOOK_DARK_MASTERS_TOKEN_DARK_DIGICORE_COST = 15

/** Exchange at Zudomon in Olympus: tokens → Energized Dark DigiCore. */
export const GUIDEBOOK_DARK_MASTERS_TOKEN_ENERGIZED_DIGICORE_COST = 7

/** [Weekly] Preparing for the Apocalypse — corrupted craft material rewards. */
export const GUIDEBOOK_PREPARING_APOCALYPSE_QUEST_ID = 'q1wasddn'

export const GUIDEBOOK_PREPARING_APOCALYPSE_DARK_DIGICORE_COUNT = 15

export const GUIDEBOOK_PREPARING_APOCALYPSE_ENERGIZED_DIGICORE_COUNT = 7

export type GuidebookCorruptedCraftMaterial = {
  itemId: string
  quantity: number
  labelFallback: string
}

/** Shared corrupted gear craft materials (ring, necklace, earring). */
export const GUIDEBOOK_CORRUPTED_CRAFT_MATERIALS: readonly GuidebookCorruptedCraftMaterial[] = [
  {
    itemId: GUIDEBOOK_DARK_DIGICORE_ITEM_ID,
    quantity: GUIDEBOOK_CORRUPTED_RING_DARK_DIGICORE_COUNT,
    labelFallback: 'Dark DigiCore',
  },
  {
    itemId: GUIDEBOOK_ENERGIZED_DARK_DIGICORE_ITEM_ID,
    quantity: GUIDEBOOK_CORRUPTED_RING_ENERGIZED_DIGICORE_COUNT,
    labelFallback: 'Energized Dark DigiCore',
  },
]

/** @deprecated Use {@link GUIDEBOOK_CORRUPTED_CRAFT_MATERIALS}. */
export const GUIDEBOOK_CORRUPTED_RING_MATERIALS = GUIDEBOOK_CORRUPTED_CRAFT_MATERIALS

export const GUIDEBOOK_CORRUPTED_GEAR_TRADEABLE_DISCLAIMER =
  '*Tradeable versions will need more materials to craft'

export type GuidebookCorruptedGearRollLine = {
  label: string
  stats: string
  hint?: string
  tone?: 'dps' | 'tank'
}

export type GuidebookCorruptedGearGuide = {
  slug: string
  craftLabel: string
  dataTitle: string
  gearLabel: string
  materials: readonly GuidebookCorruptedCraftMaterial[]
  rolls: readonly GuidebookCorruptedGearRollLine[]
  /** Wiki item id for the data piece when available. */
  dataItemId?: string
}

export const GUIDEBOOK_CORRUPTED_GEAR_GUIDES: readonly GuidebookCorruptedGearGuide[] = [
  {
    slug: 'corrupted-ring',
    craftLabel: 'corrupted ring',
    dataTitle: 'Ring Data: Corrupted Seadragon',
    gearLabel: 'ring',
    materials: GUIDEBOOK_CORRUPTED_CRAFT_MATERIALS,
    rolls: [
      {
        label: 'Recommended all-around',
        stats: 'Basic Attribute (ATT) > Basic Attribute (ATT) > AT% > AT%',
      },
      {
        label: 'Tank specific',
        stats: 'HP, HP, DEF/Basic Attribute (ATT), DEF/Basic Attribute (ATT)',
      },
    ],
  },
  {
    slug: 'corrupted-necklace',
    craftLabel: 'corrupted necklace',
    dataTitle: 'Necklace Data: Corrupted Seadragon',
    gearLabel: 'necklace',
    materials: GUIDEBOOK_CORRUPTED_CRAFT_MATERIALS,
    rolls: [
      {
        label: 'Skill Heavy Digimon',
        hint:
          'Such as Healers, Casters and Digimon that have significantly more skill weighting in their rotation.',
        stats: 'Basic Attribute (ATT), SK%, SK%, AT%',
        tone: 'dps',
      },
      {
        label: 'Auto Heavy Digimon',
        hint:
          'Such as Melee, Ranged and Digimon that have most of their damage weighting in auto attacks.',
        stats: 'Basic Attribute (ATT), AT%, AT%, SK%',
        tone: 'dps',
      },
      {
        label: 'Tank',
        stats:
          'HP, HP, BL (Defense if your block seals can take you to near 100%), Defense',
        tone: 'tank',
      },
    ],
  },
  {
    slug: 'corrupted-earring',
    craftLabel: 'corrupted earring',
    dataTitle: 'Earring Data: Corrupted Seadragon',
    gearLabel: 'earring',
    materials: GUIDEBOOK_CORRUPTED_CRAFT_MATERIALS,
    rolls: [
      {
        label: 'Skill Heavy Digimon',
        hint:
          'Such as Healers, Casters and Digimon that have significantly more skill weighting in their rotation.',
        stats: 'Critical Damage, Critical Damage, SK%, SK%',
        tone: 'dps',
      },
      {
        label: 'Auto Heavy Digimon',
        hint:
          'Such as Melee, Ranged and Digimon that have most of their damage weighting in auto attacks.',
        stats: 'Critical Damage, Critical Damage, AT%, AT%',
        tone: 'dps',
      },
      {
        label: 'Tank',
        stats:
          'HP, HP, BL (Defense if your block seals can take you to near 100%), BL (Defense if your block seals can take you to near 100%)',
        tone: 'tank',
      },
    ],
  },
]

export function guidebookCorruptedGearGuide(slug: string): GuidebookCorruptedGearGuide | undefined {
  return GUIDEBOOK_CORRUPTED_GEAR_GUIDES.find((g) => g.slug === slug)
}

export type GuidebookRingRollLine = {
  label: string
  stats: string
}

export type GuidebookRingEntry = {
  slug: string
  name: string
  /** Wiki item id when available; omitted until wiki/API supports the item. */
  itemId?: string
  rolls: readonly GuidebookRingRollLine[]
}

/** Ring craft stat targets — one block per Ring Data variant. */
export const GUIDEBOOK_RING_ENTRIES: readonly GuidebookRingEntry[] = [
  {
    slug: 'golden-seadragon',
    name: 'Ring Data: Golden Seadragon',
    itemId: GUIDEBOOK_RING_DATA_ITEM_ID,
    rolls: [
      {
        label: 'Recommended all-around',
        stats: 'Basic Attribute (ATT) > Basic Attribute (ATT) > AT% > AT%',
      },
      {
        label: 'Tank specific',
        stats: 'HP, HP, HP, DEF/Basic Attribute (ATT)',
      },
    ],
  },
  {
    slug: 'corrupted-seadragon',
    name: 'Ring Data: Corrupted Seadragon',
    rolls: [
      {
        label: 'Recommended all-around',
        stats: 'Basic Attribute (ATT) > Basic Attribute (ATT) > AT > AT',
      },
      {
        label: 'Tank specific',
        stats: 'HP, HP, DEF/Basic Attribute (ATT), DEF/Basic Attribute (ATT)',
      },
    ],
  },
]

export const GUIDEBOOK_EARLY_NECKLACE_ROLLS: readonly GuidebookCorruptedGearRollLine[] = [
  {
    label: 'Recommended all-around',
    stats: 'Basic Attribute (ATT) > Basic Attribute (ATT) > AT% > AT%',
  },
  {
    label: 'Tank specific',
    stats: 'Block > Block > HP% > HP%',
  },
]

/** Necklace Data variants (Gear → Necklace). */
export const GUIDEBOOK_NECKLACE_DATA_ITEM_IDS = ['i1rduvxy', 'i1361pdh'] as const

/** Keyring Data variants (Gear → Keyring). */
export const GUIDEBOOK_KEYRING_DATA_ITEM_IDS = ['i15re6xh', 'ia1e2ht'] as const

export const GUIDEBOOK_KEYRING_STAT_NOTES_LEAD =
  'Stats are RANDOM, with no way to reroll them. The roll ranges are:'

export const GUIDEBOOK_KEYRING_STAT_ROLLS: readonly GuidebookCorruptedGearRollLine[] = [
  { label: 'HP', stats: '185 - 370' },
  { label: 'Attack', stats: '27 - 54' },
  { label: 'Defense', stats: '17 - 37' },
]

/** Earring Data variants (Gear → Earring). Character-bound, then tradeable. */
export const GUIDEBOOK_EARRING_DATA_ITEM_IDS = ['i1g2dzms', 'i1x4w11g'] as const

export const GUIDEBOOK_EARLY_EARRING_ROLLS: readonly GuidebookCorruptedGearRollLine[] = [
  {
    label: 'Recommended all-around',
    stats: 'Critical Damage > Critical Damage > AT% > AT%',
  },
  {
    label: 'Tank specific',
    stats: 'DEF/Block > DEF/Block > HP% > HP%',
  },
]

/** Gear drops that are character-bound (shown on dungeon loot rows). */
export const GUIDEBOOK_GEAR_CHARACTER_BOUND_ITEM_IDS = [
  'i15re6xh',
  'i1g2dzms',
  'i1rduvxy',
  'iwswwcw',
  GUIDEBOOK_HOMEOSTASIS_WISH_ITEM_ID,
  GUIDEBOOK_RING_DATA_ITEM_ID,
] as const

/** Gear drops that are tradeable (shown on dungeon loot rows). */
export const GUIDEBOOK_GEAR_TRADEABLE_ITEM_IDS = ['ia1e2ht', 'i1361pdh', 'i8v0loc', 'i1x4w11g'] as const

/** Goggles Data variants (Gear → Goggles). */
export const GUIDEBOOK_GOGGLES_DATA_ITEM_IDS = ['i8v0loc', 'iwswwcw'] as const

export const GUIDEBOOK_GOGGLES_STAT_NOTES =
  'Stats for Goggles is STATIC. They provide a flat 200 stats to HP - DS - AT - DE - CT - EV to your Digimon directly.'

/** Mastemon — turn-in NPC for Mastemon's Report. */
export const GUIDEBOOK_MASTEMON_NPC_ID = 'c1vmfiwu'

import { guidebookProgressionStepIds } from './guidebookProgression'

/** All progression step ids valid for deep links. */
export function guidebookLinkableSectionIds(): string[] {
  return guidebookProgressionStepIds()
}

/** @deprecated Board UI replaces scroll spy; returns progression step ids. */
export function guidebookScrollIds(): string[] {
  return guidebookProgressionStepIds()
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

export type GuidebookPerfectCloneTier = 1 | 2 | 3 | 4 | 5

export type GuidebookPerfectCloneRow = {
  level: number
  attack: string
  critical: string
  block: string
  evasion: string
  health: string
  tier: GuidebookPerfectCloneTier
}

/** Perfect clone stat bonuses by level (wiki Perfect Clone Table). */
export const GUIDEBOOK_PERFECT_CLONE_TABLE_ROWS: readonly GuidebookPerfectCloneRow[] = [
  { level: 1, attack: '3%', critical: '15%', block: '2%', evasion: '12%', health: '2%', tier: 1 },
  { level: 2, attack: '6%', critical: '30%', block: '4%', evasion: '24%', health: '4%', tier: 1 },
  { level: 3, attack: '9%', critical: '45%', block: '6%', evasion: '36%', health: '6%', tier: 1 },
  { level: 4, attack: '14%', critical: '70%', block: '9%', evasion: '56%', health: '9%', tier: 2 },
  { level: 5, attack: '19%', critical: '95%', block: '12%', evasion: '76%', health: '12%', tier: 2 },
  { level: 6, attack: '24%', critical: '120%', block: '15%', evasion: '96%', health: '15%', tier: 2 },
  { level: 7, attack: '34%', critical: '170%', block: '21%', evasion: '136%', health: '19%', tier: 3 },
  { level: 8, attack: '44%', critical: '220%', block: '27%', evasion: '176%', health: '23%', tier: 3 },
  { level: 9, attack: '54%', critical: '270%', block: '33%', evasion: '216%', health: '27%', tier: 3 },
  { level: 10, attack: '69%', critical: '345%', block: '42%', evasion: '276%', health: '31%', tier: 4 },
  { level: 11, attack: '84%', critical: '420%', block: '51%', evasion: '336%', health: '35%', tier: 4 },
  { level: 12, attack: '99%', critical: '495%', block: '60%', evasion: '396%', health: '39%', tier: 4 },
  { level: 13, attack: '114%', critical: '570%', block: '69%', evasion: '456%', health: '44%', tier: 5 },
  { level: 14, attack: '129%', critical: '645%', block: '78%', evasion: '516%', health: '49%', tier: 5 },
  { level: 15, attack: '144%', critical: '720%', block: '87%', evasion: '576%', health: '54%', tier: 5 },
]

/** Priority clone stat targets by role. */
export const GUIDEBOOK_CLONE_RECOMMENDATIONS: readonly GuidebookCorruptedGearRollLine[] = [
  {
    label: 'DPS/Healer',
    stats: '15 Attack, Enough CT to reach 100% CT, Evasion, Block',
  },
  {
    label: 'Tank',
    stats: '15 Attack, Enough CT to reach 100% CT, Block, Evasion',
  },
]
