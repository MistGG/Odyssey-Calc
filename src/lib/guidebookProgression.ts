/** Odyssey progression board — step order and per-space objectives. */

export type GuidebookTaskKind = 'farm' | 'craft' | 'quest' | 'gear' | 'money' | 'tip'

export type GuidebookTask = {
  kind: GuidebookTaskKind
  text: string
}

export type GuidebookZoneTone = 'starter' | 'file' | 'odaiba' | 'metro' | 'gear' | 'raid' | 'corrupted'

/** Visual grouping on the progression board trail. */
export type GuidebookTrailCluster = 'gear' | 'corrupted-gear'

export type GuidebookProgressionStep = {
  id: string
  title: string
  zone: string
  zoneTone: GuidebookZoneTone
  summary: string
  tasks: GuidebookTask[]
  /** Consecutive steps with the same cluster render as one tied block on the board. */
  trailCluster?: GuidebookTrailCluster
  /** View-only card; cannot be set as the user's progression step. */
  informativeOnly?: boolean
  /** Skip the Steps list and Details label — wiki content sits directly under the header. */
  detailOnly?: boolean
}

export const OFFICIAL_HEROES_GUIDE_URL =
  'https://docs.thedigitalodyssey.com/s/1ea1524b-2c7e-4369-9608-36acb1ef87b0/doc/digital-odysseys-guide-for-new-heroes-6Klf1mAAUf'

export const OFFICIAL_ZERO_TO_HERO_GUIDE_URL =
  'https://docs.thedigitalodyssey.com/s/1ea1524b-2c7e-4369-9608-36acb1ef87b0/doc/digital-odysseys-zero-to-hero-guide-e3BWNVwpye'

/** @deprecated Use {@link OFFICIAL_HEROES_GUIDE_URL}. */
export const OFFICIAL_BEGINNERS_GUIDE_URL = OFFICIAL_HEROES_GUIDE_URL

export function guidebookEarlyGearDataFarmTask(dataName: string): string {
  return `Farm listed raid/dungeon sources for ${dataName}; check tradeable vs character-bound drops.`
}

/** Early Gear farm step for necklace. */
export const GUIDEBOOK_EARLY_GEAR_DATA_FARM_TASK = guidebookEarlyGearDataFarmTask('Necklace Data')

export const GUIDEBOOK_PROGRESSION_STEPS: GuidebookProgressionStep[] = [
  {
    id: 'starter',
    title: 'Choose your partner',
    zone: 'Starter Path',
    zoneTone: 'starter',
    summary: 'Pick a role and digimon, then push the main story through File Island.',
    tasks: [
      { kind: 'tip', text: 'Pick Melee, Ranged, Caster, Tank, or Healer (Hybrid is advanced).' },
      { kind: 'quest', text: 'Follow the main story through File Island.' },
      { kind: 'tip', text: 'Use the Official Guide for tamer basics; we skip duplicate steps here.' },
    ],
  },
  {
    id: 'early-50-70',
    title: 'Level 50 & 70 uncap',
    zone: 'File Island → Odaiba',
    zoneTone: 'file',
    summary: 'Hit the level caps, finish Mastemon’s Report, and clear both uncap dungeons.',
    tasks: [
      { kind: 'quest', text: 'Complete Mastemon’s Report to unlock the level 50 uncap quest.' },
      { kind: 'farm', text: "Farm Agumon's Madness (Normal) for the level 50 uncap." },
      { kind: 'quest', text: 'Continue story to level 70 and finish Hikari Sees Odaiba in Odaiba.' },
      { kind: 'farm', text: 'Farm The Rise of the Fallen Angel (Normal) for the level 70 uncap.' },
    ],
  },
  {
    id: 'early-70-beyond',
    title: 'EXP farming',
    zone: 'Gain levels',
    zoneTone: 'metro',
    summary: 'Level alts and partners quickly after your 70 uncap.',
    tasks: [
      { kind: 'farm', text: 'Run The Dark Roar (Story) in Big Sight for large EXP, solo or in a party.' },
      { kind: 'farm', text: 'Run VenomVamdemon in The Undying (Story) for EXP, solo or in a party.' },
      { kind: 'tip', text: 'Push toward level 90 before the next level cap.' },
    ],
  },
  {
    id: 'mid-raids',
    title: 'Raids',
    zone: 'General Content',
    zoneTone: 'raid',
    informativeOnly: true,
    summary: 'Join scheduled raid bosses for raid rewards and gear materials. Always available alongside your main progression.',
    tasks: [
      { kind: 'farm', text: 'Check the in-game raid timer and wiki boss schedules.' },
      { kind: 'gear', text: 'Target raid rewards that feed your next gear piece.' },
      { kind: 'money', text: 'Sell raid materials in the market to earn bits if needed.' },
    ],
  },
  {
    id: 'mid-seals',
    title: 'Seals',
    zone: 'General Content',
    zoneTone: 'raid',
    informativeOnly: true,
    summary: 'Farm Digimon Seal Boxes from dungeons',
    tasks: [
      { kind: 'farm', text: 'Run the dungeons listed under each seal stat for the box you need.' },
    ],
  },
  {
    id: 'mid-clones',
    title: 'Clones',
    zone: 'General Content',
    zoneTone: 'raid',
    informativeOnly: true,
    summary: 'Digimon cloning for additional stats',
    tasks: [
      { kind: 'tip', text: 'Stats scale as a percentage of your base value, except Block.' },
    ],
  },
  {
    id: 'mid-clothes',
    title: 'Clothes',
    zone: 'Early Gear',
    zoneTone: 'gear',
    trailCluster: 'gear',
    summary: 'Farm and scan DigiEggs for Explorer and Digital Gear boxes',
    tasks: [
      { kind: 'farm', text: 'Farm matching DigiEgg scan DATA from open-world monsters.' },
      { kind: 'gear', text: 'Scan eggs for a random Explorer Gear Box (Low/High Class) or Digital Gear Box (Super Class).' },
    ],
  },
  {
    id: 'mid-chips',
    title: 'Chips',
    zone: 'Early Gear',
    zoneTone: 'gear',
    trailCluster: 'gear',
    summary: '',
    tasks: [{ kind: 'tip', text: 'Detailed chips guide will be added here.' }],
  },
  {
    id: 'mid-digivice',
    title: 'Digivice',
    zone: 'Early Gear',
    zoneTone: 'gear',
    trailCluster: 'gear',
    summary: 'Collect Homeostasis Wish and crest fragments for your next digivice upgrade.',
    tasks: [
      { kind: 'farm', text: 'Gather 5 Homeostasis Wish for the digivice recipe.' },
      { kind: 'farm', text: 'Gather 10 of each fragment for the digivice recipe.' },
      { kind: 'craft', text: 'Craft your digivice at Andromon in Village of Beginning.' },
    ],
  },
  {
    id: 'mid-ring',
    title: 'Ring',
    zone: 'Early Gear',
    zoneTone: 'gear',
    trailCluster: 'gear',
    summary: 'Golden Seadragon Ring Data from targeted dungeon and raid drops.',
    tasks: [{ kind: 'farm', text: 'Farm dungeons that drop Golden Seadragon Ring Data.' }],
  },
  {
    id: 'mid-necklace',
    title: 'Necklace',
    zone: 'Early Gear',
    zoneTone: 'gear',
    trailCluster: 'gear',
    summary: '',
    tasks: [{ kind: 'farm', text: GUIDEBOOK_EARLY_GEAR_DATA_FARM_TASK }],
  },
  {
    id: 'mid-goggles',
    title: 'Goggles',
    zone: 'Early Gear',
    zoneTone: 'gear',
    trailCluster: 'gear',
    summary: '',
    tasks: [{ kind: 'farm', text: guidebookEarlyGearDataFarmTask('Goggle Data') }],
  },
  {
    id: 'mid-keyring',
    title: 'Keyring',
    zone: 'Early Gear',
    zoneTone: 'gear',
    trailCluster: 'gear',
    summary: '',
    tasks: [{ kind: 'farm', text: guidebookEarlyGearDataFarmTask('Keyring Data') }],
  },
  {
    id: 'mid-earring',
    title: 'Earring',
    zone: 'Early Gear',
    zoneTone: 'gear',
    trailCluster: 'gear',
    summary: '',
    tasks: [{ kind: 'farm', text: guidebookEarlyGearDataFarmTask('Earring Data') }],
  },
  {
    id: 'mid-corrupted-clothes',
    title: 'Olympus Clothes',
    zone: 'Corrupted gear',
    zoneTone: 'corrupted',
    trailCluster: 'corrupted-gear',
    summary: '',
    tasks: [{ kind: 'tip', text: 'Detailed Olympus clothes guide will be added here.' }],
  },
  {
    id: 'mid-corrupted-chips',
    title: 'Chips',
    zone: 'Corrupted gear',
    zoneTone: 'corrupted',
    trailCluster: 'corrupted-gear',
    summary: '',
    tasks: [{ kind: 'tip', text: 'Detailed chips guide will be added here.' }],
  },
  {
    id: 'mid-digi-aura',
    title: 'Promethean DigiAura',
    zone: 'Corrupted gear',
    zoneTone: 'corrupted',
    trailCluster: 'corrupted-gear',
    summary: 'Craft Promethean DigiAura at the Blacksmith in Olympus.',
    tasks: [
      { kind: 'farm', text: 'Farm Homeostasis Wish, Olympian Data Core, and element shards.' },
      { kind: 'craft', text: 'Craft Promethean DigiAura at the Blacksmith in Olympus.' },
    ],
  },
  {
    id: 'mid-corrupted-accessories',
    title: 'Corrupted Accessories',
    zone: 'Corrupted gear',
    zoneTone: 'corrupted',
    trailCluster: 'corrupted-gear',
    detailOnly: true,
    summary: 'Craft corrupted ring, necklace, and earring.',
    tasks: [
      {
        kind: 'farm',
        text: 'Farm Dark DigiCore and Energized Dark DigiCore (30 + 15 per accessory)',
      },
      { kind: 'craft', text: 'Craft corrupted accessories at the Blacksmith in Olympus' },
    ],
  },
]

export function guidebookProgressionStepIds(): string[] {
  return GUIDEBOOK_PROGRESSION_STEPS.map((s) => s.id)
}

export function guidebookStepIsInformative(
  stepOrId: GuidebookProgressionStep | string | undefined,
): boolean {
  const step =
    typeof stepOrId === 'string' ? guidebookProgressionStep(stepOrId) : stepOrId
  return step?.informativeOnly === true
}

/** Steps that count toward "your step" on the board (excludes informative cards). */
export function guidebookProgressionProgressSteps(): readonly GuidebookProgressionStep[] {
  return GUIDEBOOK_PROGRESSION_STEPS.filter((s) => !s.informativeOnly)
}

export function guidebookProgressEligibleStepIds(): string[] {
  return guidebookProgressionProgressSteps().map((s) => s.id)
}

export function guidebookProgressionProgressIndex(stepId: string): number {
  return guidebookProgressionProgressSteps().findIndex((s) => s.id === stepId)
}

/** Deep links and stored progress for removed step ids. */
const GUIDEBOOK_LEGACY_STEP_ALIASES: Record<string, string> = {
  'mid-corrupted-ring': 'mid-corrupted-accessories',
  'mid-corrupted-necklace': 'mid-corrupted-accessories',
  'mid-corrupted-earring': 'mid-corrupted-accessories',
}

/** Deep links: legacy aliases only — informative steps stay on the card the user opened. */
export function guidebookResolveStepId(stepId: string): string {
  const aliased = GUIDEBOOK_LEGACY_STEP_ALIASES[stepId.trim()] ?? stepId.trim()
  if (!guidebookProgressionStep(aliased)) {
    return guidebookDefaultProgressStepId()
  }
  return aliased
}

/** Stored progress only: informative cards cannot be "your step" — snap to nearest real step. */
export function guidebookNormalizeProgressStepId(stepId: string): string {
  const aliased = GUIDEBOOK_LEGACY_STEP_ALIASES[stepId.trim()] ?? stepId.trim()
  if (!guidebookStepIsInformative(aliased)) {
    if (guidebookProgressionStep(aliased)) return aliased
    return guidebookDefaultProgressStepId()
  }
  const fullIndex = guidebookProgressionIndex(aliased)
  for (let i = fullIndex + 1; i < GUIDEBOOK_PROGRESSION_STEPS.length; i++) {
    const candidate = GUIDEBOOK_PROGRESSION_STEPS[i]!
    if (!candidate.informativeOnly) return candidate.id
  }
  for (let i = fullIndex - 1; i >= 0; i--) {
    const candidate = GUIDEBOOK_PROGRESSION_STEPS[i]!
    if (!candidate.informativeOnly) return candidate.id
  }
  return guidebookDefaultProgressStepId()
}

export type GuidebookTrailGroup =
  | { kind: 'solo'; step: GuidebookProgressionStep; index: number }
  | {
      kind: 'cluster'
      cluster: GuidebookTrailCluster
      steps: { step: GuidebookProgressionStep; index: number }[]
    }

/** Board trail layout: consecutive steps sharing a {@link GuidebookTrailCluster} are grouped. */
export function guidebookProgressionTrailGroups(): GuidebookTrailGroup[] {
  const groups: GuidebookTrailGroup[] = []

  for (let index = 0; index < GUIDEBOOK_PROGRESSION_STEPS.length; index++) {
    const step = GUIDEBOOK_PROGRESSION_STEPS[index]!
    const cluster = step.trailCluster

    if (!cluster) {
      groups.push({ kind: 'solo', step, index })
      continue
    }

    const last = groups[groups.length - 1]
    if (last?.kind === 'cluster' && last.cluster === cluster) {
      last.steps.push({ step, index })
    } else {
      groups.push({ kind: 'cluster', cluster, steps: [{ step, index }] })
    }
  }

  return groups
}

const GUIDEBOOK_TRAIL_CLUSTER_LABELS: Record<GuidebookTrailCluster, string> = {
  gear: 'Early Gear',
  'corrupted-gear': 'Corrupted gear',
}

export function guidebookTrailClusterLabel(cluster: GuidebookTrailCluster): string {
  return GUIDEBOOK_TRAIL_CLUSTER_LABELS[cluster]
}

export function guidebookProgressionStep(stepId: string): GuidebookProgressionStep | undefined {
  return GUIDEBOOK_PROGRESSION_STEPS.find((s) => s.id === stepId)
}

export function guidebookProgressionIndex(stepId: string): number {
  return GUIDEBOOK_PROGRESSION_STEPS.findIndex((s) => s.id === stepId)
}

export function guidebookDefaultProgressStepId(): string {
  return GUIDEBOOK_PROGRESSION_STEPS[0]?.id ?? 'starter'
}

export function guidebookNextStepId(stepId: string): string | null {
  const start = guidebookProgressionIndex(stepId)
  if (start < 0) return null
  for (let i = start + 1; i < GUIDEBOOK_PROGRESSION_STEPS.length; i++) {
    const next = GUIDEBOOK_PROGRESSION_STEPS[i]!
    if (!next.informativeOnly) return next.id
  }
  return null
}

export const GUIDEBOOK_TASK_KIND_LABELS: Record<GuidebookTaskKind, string> = {
  farm: 'Farm',
  craft: 'Craft',
  quest: 'Quest',
  gear: 'Gear',
  money: 'Money',
  tip: 'Tip',
}
