import { normalizeWikiAttribute } from './attributeAdvantage'
import { normalizeWikiElement, trueViceElementBonusActive } from './elementAdvantage'

export const GEAR_STORAGE_KEY = 'gear-v1'

/** True Vice accessory: up to eight rolled lines (element or attribute damage %). */
export const TRUE_VICE_SLOT_COUNT = 8

export const TRUE_VICE_ELEMENT_STATS = [
  'Darkness',
  'Earth',
  'Fire',
  'Ice',
  'Light',
  'Steel',
  'Thunder',
  'Water',
  'Wind',
  'Wood',
] as const

export type TrueViceElementStat = (typeof TRUE_VICE_ELEMENT_STATS)[number]

export const TRUE_VICE_ATTRIBUTE_STATS = ['Vaccine', 'Virus', 'Data', 'Unknown'] as const

export type TrueViceAttributeStat = (typeof TRUE_VICE_ATTRIBUTE_STATS)[number]

export type TrueViceSlot = {
  category: 'element' | 'attribute' | ''
  /** Element name or attribute name matching {@link TRUE_VICE_ATTRIBUTE_STATS}. */
  stat: string
  value: number
}

export type LeftPiece = 'head-goggles' | 'fashion' | 'top' | 'bottom' | 'gloves' | 'shoes'
export type LeftStat = 'maxDs' | 'maxHp' | 'defense' | 'attack' | 'moveSpeed'
export type RingStat =
  | 'attack'
  | 'basicAttribute'
  | 'critical'
  | 'defense'
  | 'maxDs'
  | 'maxHp'
  | 'skill'
export type SealStat = 'hp' | 'ds' | 'at' | 'as' | 'ct' | 'ht' | 'de' | 'bl' | 'ev'

export type LeftPieceStats = Record<LeftStat, number>
export type LeftGearState = Record<LeftPiece, LeftPieceStats>
export type RingLine = { stat: RingStat | ''; value: number }
export type SealsState = Record<SealStat, number>
export type GearState = {
  left: LeftGearState
  ring: RingLine[]
  seals: SealsState
  trueVice: TrueViceSlot[]
}

export type GearAttackContribution = {
  ringAttack: number
  leftWeightedAttack: number
  totalAttack: number
}

export type GearStatBonuses = {
  hp: number
  ds: number
  attack: number
  atkSpeed: number
  critRate: number
  hitRate: number
  defense: number
  blockRate: number
  evasion: number
}

const LEFT_PIECES: LeftPiece[] = ['head-goggles', 'fashion', 'top', 'bottom', 'gloves', 'shoes']
const LEFT_STATS: LeftStat[] = ['maxDs', 'maxHp', 'defense', 'attack', 'moveSpeed']
const RING_STATS: RingStat[] = ['attack', 'basicAttribute', 'critical', 'defense', 'maxDs', 'maxHp', 'skill']
export const SEAL_STATS: SealStat[] = ['hp', 'ds', 'at', 'as', 'ct', 'ht', 'de', 'bl', 'ev']

function toNonNegativeNumber(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

function emptyLeftPieceStats(): LeftPieceStats {
  return { maxDs: 0, maxHp: 0, defense: 0, attack: 0, moveSpeed: 0 }
}

function emptyTrueViceSlot(): TrueViceSlot {
  return { category: '', stat: '', value: 0 }
}

export function initialTrueViceSlots(): TrueViceSlot[] {
  return Array.from({ length: TRUE_VICE_SLOT_COUNT }, () => emptyTrueViceSlot())
}

export function clampTrueViceSlot(slot: TrueViceSlot): TrueViceSlot {
  if (!slot.category || !String(slot.stat ?? '').trim()) {
    return { ...slot, stat: '', value: 0 }
  }
  const v = Math.max(0, Math.floor(toNonNegativeNumber(slot.value)))
  const cap =
    slot.category === 'element' ? 30 : slot.stat === 'Unknown' ? 14 : 20
  return { ...slot, value: Math.min(v, cap) }
}

export function aggregateTrueViceDamagePercents(gear: GearState): {
  elements: Partial<Record<string, number>>
  attributes: Partial<Record<string, number>>
} {
  const elements: Partial<Record<string, number>> = {}
  const attributes: Partial<Record<string, number>> = {}
  for (const raw of gear.trueVice ?? []) {
    const s = clampTrueViceSlot(raw)
    if (!s.category || !s.stat) continue
    if (s.category === 'element') {
      const k = normalizeWikiElement(s.stat)
      if (!k) continue
      elements[k] = Math.max(elements[k] ?? 0, s.value)
    } else {
      const k = normalizeWikiAttribute(s.stat)
      if (!k) continue
      attributes[k] = Math.max(attributes[k] ?? 0, s.value)
    }
  }
  return { elements, attributes }
}

/**
 * Fractional bonuses (0–0.3 etc.) on the wiki skill coefficient stack.
 * Element: digimon **element** must match the True Vice element stat, and the True Vice chart must say
 * the digimon **beats** the enemy element. Attribute: digimon **attribute** must match the True Vice
 * attribute stat; triangle targets need the same enemy attribute; Unknown uses Free/Unknown digimon vs
 * neutral enemy bucket.
 */
export function trueViceDamageFractionsForSkillHit(
  attackerAttribute: string,
  attackerElement: string,
  targetEnemyAttribute: string,
  targetEnemyElement: string,
  gear: GearState,
): { element: number; attribute: number } {
  const agg = aggregateTrueViceDamagePercents(gear)
  let elementFrac = 0
  const digiEl = normalizeWikiElement(attackerElement)
  for (const [rollKey, pct] of Object.entries(agg.elements)) {
    if (!pct || pct <= 0) continue
    if (normalizeWikiElement(rollKey) !== digiEl) continue
    if (!trueViceElementBonusActive(attackerElement, targetEnemyElement)) continue
    elementFrac += pct / 100
  }

  const enemyAttr = normalizeWikiAttribute(targetEnemyAttribute)
  const digiAttr = normalizeWikiAttribute(attackerAttribute)
  let attrFrac = 0
  if (enemyAttr === 'Vaccine' || enemyAttr === 'Virus' || enemyAttr === 'Data') {
    if (digiAttr === enemyAttr) {
      attrFrac = (agg.attributes[enemyAttr] ?? 0) / 100
    }
  } else if (!enemyAttr || enemyAttr === 'None' || enemyAttr === 'Free') {
    const unk = agg.attributes.Unknown ?? 0
    if (unk > 0 && (digiAttr === 'Free' || digiAttr === 'Unknown')) {
      attrFrac = unk / 100
    }
  }
  return { element: elementFrac, attribute: attrFrac }
}

/**
 * Matches {@link dpsSim} `preSkillBuffMult`: clone tier bonus + True Vice element/attribute fractions on the wiki skill coefficient.
 */
export function wikiTrueVicePreSkillBuffMultiplier(
  perfectAtClone: boolean,
  attackerAttribute: string,
  attackerElement: string,
  targetEnemyAttribute: string,
  targetEnemyElement: string,
  gear: GearState,
): number {
  const cloneMult = perfectAtClone ? 1.43 : 1
  const tv = trueViceDamageFractionsForSkillHit(
    attackerAttribute,
    attackerElement,
    targetEnemyAttribute,
    targetEnemyElement,
    gear,
  )
  return 1 + (cloneMult - 1) + tv.element + tv.attribute
}

/**
 * Rescale cached rotation DPS when True Vice wiki multiplier changes (enemy element or gear), same heuristic as attribute targeting: scale non-auto portion.
 */
export function adjustRotationDpsForTrueViceWikiMultRatio(
  totalDps: number,
  autoDps: number | undefined,
  ratio: number,
): number {
  if (!Number.isFinite(ratio) || ratio <= 0 || Math.abs(ratio - 1) < 1e-12) return totalDps
  if (autoDps == null || !Number.isFinite(autoDps) || !Number.isFinite(totalDps)) return totalDps
  const skillDps = Math.max(0, totalDps - autoDps)
  return autoDps + skillDps * ratio
}

export function adjustDpsRotationCategoryScoresForTrueViceWikiMultRatio<
  T extends {
    sustained: number
    burst: number
    sustainedAutoDps?: number
    burstAutoDps?: number
  },
>(scores: T | undefined, ratio: number): T | undefined {
  if (!scores) return undefined
  return {
    ...scores,
    sustained: adjustRotationDpsForTrueViceWikiMultRatio(
      scores.sustained,
      scores.sustainedAutoDps,
      ratio,
    ),
    burst: adjustRotationDpsForTrueViceWikiMultRatio(scores.burst, scores.burstAutoDps, ratio),
  }
}

export function initialGearState(): GearState {
  return {
    left: {
      'head-goggles': emptyLeftPieceStats(),
      fashion: emptyLeftPieceStats(),
      top: emptyLeftPieceStats(),
      bottom: emptyLeftPieceStats(),
      gloves: emptyLeftPieceStats(),
      shoes: emptyLeftPieceStats(),
    },
    ring: Array.from({ length: 4 }, () => ({ stat: '', value: 0 })),
    seals: { hp: 0, ds: 0, at: 0, as: 0, ct: 0, ht: 0, de: 0, bl: 0, ev: 0 },
    trueVice: initialTrueViceSlots(),
  }
}

function readRawGearState(): Partial<GearState> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(GEAR_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as Partial<GearState>
  } catch {
    return null
  }
}

export function readGearState(): GearState {
  const parsed = readRawGearState()
  const base = initialGearState()
  if (!parsed) return base

  if (parsed.left && typeof parsed.left === 'object') {
    for (const piece of LEFT_PIECES) {
      const stats = parsed.left[piece]
      if (!stats || typeof stats !== 'object') continue
      for (const stat of LEFT_STATS) {
        base.left[piece][stat] = Math.floor(toNonNegativeNumber(stats[stat]))
      }
    }
  }

  if (Array.isArray(parsed.ring)) {
    base.ring = Array.from({ length: 4 }, (_, i) => {
      const line = parsed.ring?.[i]
      const stat = line?.stat
      const valid = Boolean(stat && RING_STATS.includes(stat))
      return {
        stat: valid ? (stat as RingStat) : '',
        value: Math.floor(toNonNegativeNumber(line?.value)),
      }
    })
  }

  if (parsed.seals && typeof parsed.seals === 'object') {
    for (const stat of SEAL_STATS) {
      base.seals[stat] = Math.floor(toNonNegativeNumber(parsed.seals[stat]))
    }
  }

  if (Array.isArray((parsed as Partial<GearState>).trueVice)) {
    base.trueVice = Array.from({ length: TRUE_VICE_SLOT_COUNT }, (_, i) => {
      const row = (parsed as Partial<GearState>).trueVice?.[i]
      if (!row || typeof row !== 'object') return emptyTrueViceSlot()
      const category =
        (row as TrueViceSlot).category === 'element' || (row as TrueViceSlot).category === 'attribute'
          ? (row as TrueViceSlot).category
          : ''
      const stat = typeof (row as TrueViceSlot).stat === 'string' ? (row as TrueViceSlot).stat : ''
      return clampTrueViceSlot({
        category,
        stat,
        value: toNonNegativeNumber((row as TrueViceSlot).value),
      })
    })
  }

  return base
}

export function getGearStatBonuses(): GearStatBonuses {
  const seals = readGearState().seals
  return {
    hp: seals.hp,
    ds: seals.ds,
    attack: seals.at,
    atkSpeed: seals.as,
    critRate: seals.ct,
    hitRate: seals.ht,
    defense: seals.de,
    blockRate: seals.bl,
    evasion: seals.ev,
  }
}

export function getGearAttackContribution(): GearAttackContribution {
  const parsed = readRawGearState()
  if (!parsed) return { ringAttack: 0, leftWeightedAttack: 0, totalAttack: 0 }

  let ringAttack = 0
  if (Array.isArray(parsed.ring)) {
    for (const line of parsed.ring) {
      if (!line || typeof line !== 'object') continue
      const stat = (line as RingLine).stat
      if (!stat || !RING_STATS.includes(stat) || stat !== 'attack') continue
      ringAttack += Math.floor(toNonNegativeNumber((line as RingLine).value))
    }
  }

  let leftWeightedAttack = 0
  if (parsed.left && typeof parsed.left === 'object') {
    for (const piece of LEFT_PIECES) {
      const stats = parsed.left[piece]
      if (!stats || typeof stats !== 'object') continue
      const flooredAttack = Math.floor(toNonNegativeNumber(stats.attack))
      leftWeightedAttack += flooredAttack * 0.6
    }
  }

  return {
    ringAttack,
    leftWeightedAttack,
    totalAttack: ringAttack + leftWeightedAttack,
  }
}
