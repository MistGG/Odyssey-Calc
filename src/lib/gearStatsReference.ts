/**
 * Gear stat roll reference (by gear piece, not by stat).
 * Source: https://docs.thedigitalodyssey.com/s/b61914e5-b69b-4cc8-b297-dc1abc067808
 */

export type GearStatRollEntry = {
  stat: string
  /** Display range, e.g. "1 – 6" or "150 – 800". */
  range: string
  /** True when the doc lists a flat value instead of a percent roll. */
  isFlat?: boolean
  maxSlots: number
}

export type GearStatsPiece = {
  slug: string
  name: string
  /** Full wiki item name used for icon lookup, e.g. "Ring Data: Golden Seadragon". */
  wikiItemName: string
  wikiItemId?: string
  iconId?: string
  rolls: readonly GearStatRollEntry[]
}

export type GearStatsCategory = {
  slug: string
  label: string
  dataPrefix: 'Ring' | 'Necklace' | 'Earrings' | 'Bracelet'
  pieces: readonly GearStatsPiece[]
}

export const GEAR_STATS_SOURCE_URL =
  'https://docs.thedigitalodyssey.com/s/b61914e5-b69b-4cc8-b297-dc1abc067808'

function roll(
  stat: string,
  range: string,
  maxSlots: number,
  isFlat?: boolean,
): GearStatRollEntry {
  return { stat, range, maxSlots, ...(isFlat ? { isFlat: true } : {}) }
}

export const GEAR_STATS_CATEGORIES: readonly GearStatsCategory[] = [
  {
    slug: 'rings',
    label: 'Rings',
    dataPrefix: 'Ring',
    pieces: [
      {
        slug: 'golden-seadragon',
        name: 'Golden Seadragon',
        wikiItemName: 'Ring Data: Golden Seadragon',
        wikiItemId: 'ib9xrv6',
        iconId: 'n1ux2jqq',
        rolls: [
          roll('Max HP', '150 – 800', 3, true),
          roll('Max DS', '150 – 800', 3, true),
          roll('AT%', '1 – 6', 2),
          roll('Basic Attribute%', '1 – 5', 2),
          roll('DE%', '40 – 75', 2, true),
          roll('Critical', '1 – 5', 2),
        ],
      },
      {
        slug: 'corrupted-seadragon',
        name: 'Corrupted Seadragon',
        wikiItemName: 'Ring Data: Corrupted Seadragon',
        wikiItemId: 'ih92j7z',
        iconId: 'nmqne5p',
        rolls: [
          roll('Max HP%', '5 – 10', 2),
          roll('Max DS%', '5 – 10', 2),
          roll('AT%', '1 – 7.5', 2),
          roll('Skill Damage%', '0.5 – 7.2', 2),
          roll('Evasion (Avoid)', '1 – 5', 2),
          roll('Block', '1 – 7', 2),
          roll('Basic Attribute%', '1 – 7', 2),
          roll('DE%', '1 – 13', 2),
        ],
      },
      {
        slug: 'dark-seadragon',
        name: 'Dark Seadragon',
        wikiItemName: 'Ring Data: Dark Seadragon',
        rolls: [
          roll('Max HP%', '5 – 15', 2),
          roll('Max DS%', '5 – 12', 2),
          roll('AT%', '1 – 12', 2),
          roll('Skill Damage%', '0.5 – 10', 2),
          roll('Evasion (Avoid)', '1 – 8', 2),
          roll('Block', '1 – 10', 2),
          roll('Basic Attribute%', '1 – 9', 2),
          roll('DE%', '1 – 14', 2),
        ],
      },
    ],
  },
  {
    slug: 'necklaces',
    label: 'Necklaces',
    dataPrefix: 'Necklace',
    pieces: [
      {
        slug: 'cursed-puppet',
        name: 'Cursed Puppet',
        wikiItemName: 'Necklace Data: Cursed Puppet',
        wikiItemId: 'i1rduvxy',
        iconId: 'n1xyxgll',
        rolls: [
          roll('Max HP%', '2.5 – 5', 2),
          roll('Max DS%', '2.5 – 5', 2),
          roll('AT%', '2.5 – 5', 2),
          roll('Skill Damage%', '0.1 – 1.2', 2),
          roll('Evasion (Avoid)', '2 – 5', 2),
          roll('Block', '2 – 5', 2),
          roll('Basic Attribute%', '2 – 5', 2),
          roll('Attack Speed%', '1 – 2.5', 1),
          roll('Hit Rate', '250 – 500', 1, true),
        ],
      },
      {
        slug: 'corrupted-puppet',
        name: 'Corrupted Puppet',
        wikiItemName: 'Necklace Data: Corrupted Puppet',
        wikiItemId: 'iqpok6',
        iconId: 'n1rthxdu',
        rolls: [
          roll('Max HP%', '2.5 – 7.5', 2),
          roll('Max DS%', '2.5 – 7.5', 2),
          roll('AT%', '1 – 7.5', 2),
          roll('Skill Damage%', '0.5 – 7.2', 2),
          roll('Evasion (Avoid)', '1 – 7', 2),
          roll('Block', '1 – 7', 1),
          roll('Basic Attribute%', '1 – 7', 1),
          roll('DE%', '1 – 13', 2),
          roll('Attack Speed%', '1 – 5', 1),
          roll('Hit Rate', '250 – 750', 1, true),
        ],
      },
      {
        slug: 'dark-puppet',
        name: 'Dark Puppet',
        wikiItemName: 'Necklace Data: Dark Puppet',
        rolls: [
          roll('Max HP%', '2.5 – 15', 2),
          roll('Max DS%', '2.5 – 12', 2),
          roll('AT%', '1 – 10', 2),
          roll('Skill Damage%', '0.5 – 10', 2),
          roll('Evasion (Avoid)', '1 – 10', 2),
          roll('Block', '1 – 10', 1),
          roll('Basic Attribute%', '1 – 10', 1),
          roll('DE%', '1 – 14', 2),
          roll('Attack Speed%', '1 – 7.5', 1),
          roll('Hit Rate', '100 – 1000', 1, true),
        ],
      },
    ],
  },
  {
    slug: 'earrings',
    label: 'Earrings',
    dataPrefix: 'Earrings',
    pieces: [
      {
        slug: 'fullmetal-tyrant',
        name: 'Fullmetal Tyrant',
        wikiItemName: 'Earrings Data: Fullmetal Tyrant',
        wikiItemId: 'i1g2dzms',
        iconId: 'n7veff',
        rolls: [
          roll('Max HP%', '1 – 7', 2),
          roll('AT%', '1 – 5', 2),
          roll('Skill Damage%', '0.1 – 1.2', 2),
          roll('Evasion (Avoid)', '1 – 4', 2),
          roll('Block', '1 – 5', 2),
          roll('DE%', '1 – 10', 2),
          roll('Hit Rate', '100 – 400', 2, true),
          roll('Critical Damage%', '1 – 4', 2),
        ],
      },
      {
        slug: 'corrupted-tyrant',
        name: 'Corrupted Tyrant',
        wikiItemName: 'Earrings Data: Corrupted Tyrant',
        wikiItemId: 'i3myjkq',
        iconId: 'n1ug3p37',
        rolls: [
          roll('Max HP%', '5 – 10', 1),
          roll('AT%', '1 – 7.5', 2),
          roll('Skill Damage%', '0.5 – 7.2', 2),
          roll('Evasion (Avoid)', '1 – 7', 2),
          roll('Block', '1 – 7', 2),
          roll('DE%', '1 – 13', 2),
          roll('Hit Rate', '300 – 700', 2, true),
          roll('Critical Damage%', '1 – 8', 2),
        ],
      },
      {
        slug: 'fullmetal-dark-tyrant',
        name: 'Fullmetal Dark Tyrant',
        wikiItemName: 'Earrings Data: Fullmetal Dark Tyrant',
        rolls: [
          roll('Max HP%', '1 – 15', 2),
          roll('AT%', '1 – 10', 2),
          roll('Skill Damage%', '0.5 – 10', 2),
          roll('Evasion (Avoid)', '1 – 10', 2),
          roll('Block', '1 – 10', 2),
          roll('DE%', '1 – 14', 2),
          roll('Hit Rate', '100 – 1000', 2, true),
          roll('Critical Damage%', '1 – 10', 2),
        ],
      },
    ],
  },
  {
    slug: 'bracelets',
    label: 'Bracelets',
    dataPrefix: 'Bracelet',
    pieces: [
      {
        slug: 'fiendish-clown',
        name: 'Fiendish Clown',
        wikiItemName: 'Bracelet Data: Fiendish Clown',
        rolls: [
          roll('Max HP%', '2.5 – 5', 2),
          roll('Max DS%', '2 – 5', 2),
          roll('AT%', '2.5 – 5', 2),
          roll('Skill Damage%', '0.1 – 1.2', 2),
          roll('Evasion (Avoid)', '2 – 5', 2),
          roll('Block', '2 – 5', 2),
          roll('Basic Attribute%', '2 – 5', 2),
          roll('Hit Rate', '250 – 500', 1, true),
          roll('Attack Speed%', '2.5 – 5', 1),
        ],
      },
      {
        slug: 'corrupted-clown',
        name: 'Corrupted Clown',
        wikiItemName: 'Bracelet Data: Corrupted Clown',
        wikiItemId: 'is8i49k',
        iconId: 'n1uu27by',
        rolls: [
          roll('Max HP%', '1 – 10', 2),
          roll('Max DS%', '1 – 10', 1),
          roll('AT%', '1 – 7.5', 2),
          roll('Skill Damage%', '0.5 – 7.2', 2),
          roll('Evasion (Avoid)', '1 – 5', 1),
          roll('Block', '1 – 5', 2),
          roll('DE%', '1 – 7.5', 2),
          roll('Hit Rate', '100 – 800', 2, true),
          roll('Critical Damage%', '1 – 8', 2),
        ],
      },
      {
        slug: 'dark-clown',
        name: 'Dark Clown',
        wikiItemName: 'Bracelet Data: Dark Clown',
        rolls: [
          roll('Max HP%', '1 – 15', 2),
          roll('Max DS%', '1 – 15', 1),
          roll('AT%', '1 – 10', 2),
          roll('Skill Damage%', '0.5 – 10', 2),
          roll('Evasion (Avoid)', '1 – 8', 1),
          roll('Block', '1 – 8', 2),
          roll('DE%', '1 – 10', 2),
          roll('Hit Rate', '100 – 1000', 2, true),
          roll('Critical Damage%', '1 – 10', 2),
        ],
      },
    ],
  },
]

export function formatGearStatRange(entry: GearStatRollEntry): string {
  if (entry.isFlat) return entry.range
  return `${entry.range}%`
}

export function gearStatsPiecesFlat(): GearStatsPiece[] {
  return GEAR_STATS_CATEGORIES.flatMap((category) => category.pieces)
}
