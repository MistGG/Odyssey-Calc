import {
  attributeAdvantageSkillDamageMultiplier,
  normalizeWikiAttribute,
} from './attributeAdvantage'
import { normalizeWikiElement } from './elementAdvantage'

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

export type LeftPiece =
  | 'head'
  | 'goggles'
  | 'fashion'
  | 'top'
  | 'bottom'
  | 'gloves'
  | 'shoes'
  | 'keyring'
  | 'costume'
export type FullLeftPiece = 'head' | 'fashion' | 'top' | 'bottom' | 'gloves' | 'shoes'
export type LeftStat = 'maxDs' | 'maxHp' | 'defense' | 'attack' | 'moveSpeed'
export type FullLeftPieceStats = Record<LeftStat, number>
export type CostumeStat = 'attack' | 'maxHp'
export type CostumeStats = Record<CostumeStat, number>
export type KeyringStat = 'attack' | 'maxHp' | 'defense'
export type KeyringStats = Record<KeyringStat, number>
/** Goggles roll "All Stat" — applies Attack, Max HP, Max DS, Defense, and Evasion at 100%. */
export type GogglesStats = { allStat: number }
export type AccessoryStat =
  | 'attackPct'
  | 'basicAttributePct'
  | 'defensePct'
  | 'maxDsPct'
  | 'maxHpPct'
  | 'skillFlat'
  | 'skillPct'
  | 'critDamagePct'
  | 'blockPct'
  | 'evasionPct'
  | 'hitRatePct'
/** @deprecated Use {@link AccessoryStat}. */
export type RingStat = AccessoryStat

export type AccessoryCombatBonuses = {
  attackPct: number
  basicAttributePct: number
  defensePct: number
  maxDsPct: number
  maxHpPct: number
  skillFlat: number
  skillPct: number
  critDamagePct: number
  blockPct: number
  evasionPct: number
  hitRatePct: number
}

export const ACCESSORY_STAT_OPTIONS: ReadonlyArray<{ id: AccessoryStat; label: string }> = [
  { id: 'attackPct', label: 'Attack %' },
  { id: 'basicAttributePct', label: 'Basic Attribute %' },
  { id: 'defensePct', label: 'Defense %' },
  { id: 'maxDsPct', label: 'Max DS %' },
  { id: 'maxHpPct', label: 'Max HP %' },
  { id: 'skillFlat', label: 'Skill (flat)' },
  { id: 'skillPct', label: 'Skill %' },
  { id: 'critDamagePct', label: 'Crit Damage %' },
  { id: 'blockPct', label: 'Block %' },
  { id: 'evasionPct', label: 'Avoid (Evasion) %' },
  { id: 'hitRatePct', label: 'Hit Rate %' },
]
export type SealStat = 'hp' | 'ds' | 'at' | 'as' | 'ct' | 'ht' | 'de' | 'bl' | 'ev'

export type SealsState = Record<SealStat, number>

/** Wiki combat stats used to resolve seal % rolls into effective bonuses. */
export type WikiCombatBaseForSeals = {
  hp: number
  attack: number
  defense: number
  crit_rate: number
  block_rate: number
  evasion: number
}

export const SEAL_STAT_META: ReadonlyArray<{ id: SealStat; label: string; isPercent: boolean }> = [
  { id: 'hp', label: 'HP', isPercent: true },
  { id: 'ds', label: 'DS', isPercent: false },
  { id: 'at', label: 'Attack', isPercent: true },
  { id: 'as', label: 'Attack Speed', isPercent: false },
  { id: 'ct', label: 'Crit Rate', isPercent: true },
  { id: 'ht', label: 'Hit Rate', isPercent: false },
  { id: 'de', label: 'Defense', isPercent: true },
  { id: 'bl', label: 'Block', isPercent: true },
  { id: 'ev', label: 'Evasion', isPercent: true },
]

export const SEAL_PERCENT_STATS = SEAL_STAT_META.filter((s) => s.isPercent).map((s) => s.id)
export const SEAL_FLAT_STATS = SEAL_STAT_META.filter((s) => !s.isPercent).map((s) => s.id)
export type LeftGearState = {
  [K in FullLeftPiece]: FullLeftPieceStats
} & {
  goggles: GogglesStats
  keyring: KeyringStats
  costume: CostumeStats
}
export type AccessoryLine = { stat: AccessoryStat | ''; value: number }
/** @deprecated Use {@link AccessoryLine}. */
export type RingLine = AccessoryLine
export type LeftPieceStats = FullLeftPieceStats
export type GearState = {
  left: LeftGearState
  ring: AccessoryLine[]
  necklace: AccessoryLine[]
  earring: AccessoryLine[]
  seals: SealsState
  trueVice: TrueViceSlot[]
  /** When true, ignore manual True Vice lines and assume all elements/attributes are max rolled. */
  trueViceAllMaxed: boolean
}

export const ACCESSORY_LINE_COUNT = 4

export type GearAttackContribution = {
  leftWeightedAttack: number
  gogglesAllStatAttack: number
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

const FULL_LEFT_PIECES: FullLeftPiece[] = ['head', 'fashion', 'top', 'bottom', 'gloves', 'shoes']
const LEFT_ATTACK_AT_60_PIECES = [...FULL_LEFT_PIECES, 'costume', 'keyring'] as const
type LeftAttackAt60Piece = (typeof LEFT_ATTACK_AT_60_PIECES)[number]
const LEFT_STATS: LeftStat[] = ['maxDs', 'maxHp', 'defense', 'attack', 'moveSpeed']
export const LEFT_EQUIPMENT_ATTACK_WEIGHT = 0.6
const ACCESSORY_STATS: AccessoryStat[] = ACCESSORY_STAT_OPTIONS.map((o) => o.id)

const LEGACY_ACCESSORY_STAT: Record<string, AccessoryStat> = {
  attack: 'attackPct',
  basicAttribute: 'basicAttributePct',
  critical: 'critDamagePct',
  defense: 'defensePct',
  maxDs: 'maxDsPct',
  maxHp: 'maxHpPct',
  skill: 'skillPct',
}

function normalizeAccessoryStat(stat: unknown): AccessoryStat | '' {
  if (typeof stat !== 'string' || !stat) return ''
  if (ACCESSORY_STATS.includes(stat as AccessoryStat)) return stat as AccessoryStat
  const migrated = LEGACY_ACCESSORY_STAT[stat]
  return migrated ?? ''
}

const EMPTY_ACCESSORY_COMBAT_BONUSES: AccessoryCombatBonuses = {
  attackPct: 0,
  basicAttributePct: 0,
  defensePct: 0,
  maxDsPct: 0,
  maxHpPct: 0,
  skillFlat: 0,
  skillPct: 0,
  critDamagePct: 0,
  blockPct: 0,
  evasionPct: 0,
  hitRatePct: 0,
}
export const SEAL_STATS: SealStat[] = ['hp', 'ds', 'at', 'as', 'ct', 'ht', 'de', 'bl', 'ev']

function emptyAccessoryLines(): AccessoryLine[] {
  return Array.from({ length: ACCESSORY_LINE_COUNT }, () => ({ stat: '', value: 0 }))
}

function readAccessoryLines(raw: unknown): AccessoryLine[] {
  if (!Array.isArray(raw)) return emptyAccessoryLines()
  return Array.from({ length: ACCESSORY_LINE_COUNT }, (_, i) => {
    const line = raw[i]
    const stat = normalizeAccessoryStat(line?.stat)
    return {
      stat,
      value: Math.floor(toNonNegativeNumber(line?.value)),
    }
  })
}

function sumAccessoryLines(lines: readonly AccessoryLine[], stat: AccessoryStat): number {
  let total = 0
  for (const line of lines) {
    if (line.stat !== stat) continue
    total += Math.floor(toNonNegativeNumber(line.value))
  }
  return total
}

function aggregateAccessoryLines(lines: readonly AccessoryLine[]): AccessoryCombatBonuses {
  const out = { ...EMPTY_ACCESSORY_COMBAT_BONUSES }
  for (const { id } of ACCESSORY_STAT_OPTIONS) {
    out[id] = sumAccessoryLines(lines, id)
  }
  return out
}

export function aggregateAccessoryCombatBonuses(gear: GearState): AccessoryCombatBonuses {
  const ring = aggregateAccessoryLines(gear.ring)
  const necklace = aggregateAccessoryLines(gear.necklace)
  const earring = aggregateAccessoryLines(gear.earring)
  const out = { ...EMPTY_ACCESSORY_COMBAT_BONUSES }
  for (const key of Object.keys(out) as (keyof AccessoryCombatBonuses)[]) {
    out[key] = ring[key] + necklace[key] + earring[key]
  }
  return out
}

export function emptyAccessoryCombatBonuses(): AccessoryCombatBonuses {
  return { ...EMPTY_ACCESSORY_COMBAT_BONUSES }
}

function toNonNegativeNumber(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

function emptyFullLeftPieceStats(): FullLeftPieceStats {
  return { maxDs: 0, maxHp: 0, defense: 0, attack: 0, moveSpeed: 0 }
}

function emptyCostumeStats(): CostumeStats {
  return { attack: 0, maxHp: 0 }
}

function emptyKeyringStats(): KeyringStats {
  return { attack: 0, maxHp: 0, defense: 0 }
}

function readCostumeStats(raw: unknown): CostumeStats {
  if (!raw || typeof raw !== 'object') return emptyCostumeStats()
  const stats = raw as Record<string, unknown>
  return {
    attack: Math.floor(toNonNegativeNumber(stats.attack)),
    maxHp: Math.floor(toNonNegativeNumber(stats.maxHp)),
  }
}

function readKeyringStats(raw: unknown): KeyringStats {
  if (!raw || typeof raw !== 'object') return emptyKeyringStats()
  const stats = raw as Record<string, unknown>
  return {
    attack: Math.floor(toNonNegativeNumber(stats.attack)),
    maxHp: Math.floor(toNonNegativeNumber(stats.maxHp)),
    defense: Math.floor(toNonNegativeNumber(stats.defense)),
  }
}

function emptyGogglesStats(): GogglesStats {
  return { allStat: 0 }
}

function readGogglesStats(raw: unknown): GogglesStats {
  if (!raw || typeof raw !== 'object') return emptyGogglesStats()
  const stats = raw as Record<string, unknown>
  if ('allStat' in stats) {
    return { allStat: Math.floor(toNonNegativeNumber(stats.allStat)) }
  }
  const legacyAttack = Math.floor(toNonNegativeNumber(stats.attack))
  return legacyAttack > 0 ? { allStat: legacyAttack } : emptyGogglesStats()
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
    slot.category === 'element'
      ? TRUE_VICE_ELEMENT_MAX_PCT
      : slot.stat === 'Unknown'
        ? TRUE_VICE_UNKNOWN_MAX_PCT
        : TRUE_VICE_ATTRIBUTE_MAX_PCT
  return { ...slot, value: Math.min(v, cap) }
}

export const TRUE_VICE_ELEMENT_MAX_PCT = 30
export const TRUE_VICE_ATTRIBUTE_MAX_PCT = 20
export const TRUE_VICE_UNKNOWN_MAX_PCT = 14

export function allMaxedTrueViceDamagePercents(): {
  elements: Partial<Record<string, number>>
  attributes: Partial<Record<string, number>>
} {
  const elements: Partial<Record<string, number>> = {}
  for (const el of TRUE_VICE_ELEMENT_STATS) {
    const k = normalizeWikiElement(el)
    if (k) elements[k] = TRUE_VICE_ELEMENT_MAX_PCT
  }
  return {
    elements,
    attributes: {
      Vaccine: TRUE_VICE_ATTRIBUTE_MAX_PCT,
      Virus: TRUE_VICE_ATTRIBUTE_MAX_PCT,
      Data: TRUE_VICE_ATTRIBUTE_MAX_PCT,
      Unknown: TRUE_VICE_UNKNOWN_MAX_PCT,
    },
  }
}

export function aggregateTrueViceDamagePercents(gear: GearState): {
  elements: Partial<Record<string, number>>
  attributes: Partial<Record<string, number>>
} {
  if (gear.trueViceAllMaxed) return allMaxedTrueViceDamagePercents()

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
 * Element: digimon **element** must match the True Vice element stat (enemy element is not used).
 * Attribute: digimon **attribute** must match the True Vice attribute stat; triangle targets need the same
 * enemy attribute; Unknown uses Free/Unknown digimon vs neutral enemy bucket.
 */
export function trueViceDamageFractionsForSkillHit(
  attackerAttribute: string,
  attackerElement: string,
  targetEnemyAttribute: string,
  gear: GearState,
): { element: number; attribute: number } {
  const agg = aggregateTrueViceDamagePercents(gear)
  let elementFrac = 0
  const digiEl = normalizeWikiElement(attackerElement)
  for (const [rollKey, pct] of Object.entries(agg.elements)) {
    if (!pct || pct <= 0) continue
    if (normalizeWikiElement(rollKey) !== digiEl) continue
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
 * Matches {@link dpsSim} `preSkillBuffMult`: clone tier bonus + True Vice element on wiki; TV attribute is
 * omitted here when it is folded into the skill-hit triangle multiplier (same as sim).
 */
export function wikiTrueVicePreSkillBuffMultiplier(
  perfectAtClone: boolean,
  attackerAttribute: string,
  attackerElement: string,
  targetEnemyAttribute: string,
  gear: GearState,
): number {
  const cloneMult = perfectAtClone ? 1.43 : 1
  const tri = attributeAdvantageSkillDamageMultiplier(attackerAttribute, targetEnemyAttribute)
  const tv = trueViceDamageFractionsForSkillHit(
    attackerAttribute,
    attackerElement,
    targetEnemyAttribute,
    gear,
  )
  const cloneOff = cloneMult - 1
  if (tri > 1 + 1e-9 && tv.attribute > 1e-12) {
    return 1 + cloneOff + tv.element
  }
  return 1 + cloneOff + tv.element + tv.attribute
}

/**
 * Rescale cached rotation DPS when True Vice wiki multiplier changes (gear), same heuristic as attribute targeting: scale non-auto portion.
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
      head: emptyFullLeftPieceStats(),
      goggles: emptyGogglesStats(),
      fashion: emptyFullLeftPieceStats(),
      top: emptyFullLeftPieceStats(),
      bottom: emptyFullLeftPieceStats(),
      gloves: emptyFullLeftPieceStats(),
      shoes: emptyFullLeftPieceStats(),
      keyring: emptyKeyringStats(),
      costume: emptyCostumeStats(),
    },
    ring: emptyAccessoryLines(),
    necklace: emptyAccessoryLines(),
    earring: emptyAccessoryLines(),
    seals: { hp: 0, ds: 0, at: 0, as: 0, ct: 0, ht: 0, de: 0, bl: 0, ev: 0 },
    trueVice: initialTrueViceSlots(),
    trueViceAllMaxed: false,
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
    const legacyLeft = parsed.left as Record<string, unknown>
    const legacyHeadGoggles = legacyLeft['head-goggles']
    if (legacyHeadGoggles && typeof legacyHeadGoggles === 'object') {
      if (!legacyLeft.head) legacyLeft.head = legacyHeadGoggles
      if (!legacyLeft.goggles) legacyLeft.goggles = emptyGogglesStats()
    }
    for (const piece of FULL_LEFT_PIECES) {
      const stats = legacyLeft[piece]
      if (!stats || typeof stats !== 'object') continue
      for (const stat of LEFT_STATS) {
        base.left[piece][stat] = Math.floor(toNonNegativeNumber((stats as Record<string, unknown>)[stat]))
      }
    }
    base.left.goggles = readGogglesStats(legacyLeft.goggles)
    base.left.keyring = readKeyringStats(legacyLeft.keyring)
    base.left.costume = readCostumeStats(legacyLeft.costume)
  }

  base.ring = readAccessoryLines(parsed.ring)
  base.necklace = readAccessoryLines(parsed.necklace)
  base.earring = readAccessoryLines(parsed.earring)

  if (parsed.seals && typeof parsed.seals === 'object') {
    for (const stat of SEAL_STATS) {
      base.seals[stat] = Math.floor(toNonNegativeNumber(parsed.seals[stat]))
    }
  }

  if (typeof (parsed as Partial<GearState>).trueViceAllMaxed === 'boolean') {
    base.trueViceAllMaxed = (parsed as Partial<GearState>).trueViceAllMaxed!
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

export function resolveSealStatBonuses(
  seals: SealsState,
  base: WikiCombatBaseForSeals,
): GearStatBonuses {
  const pctOf = (wikiStat: number, roll: number) =>
    Math.floor(Math.max(0, wikiStat) * Math.max(0, roll) / 100)

  return {
    hp: pctOf(base.hp, seals.hp),
    ds: Math.floor(toNonNegativeNumber(seals.ds)),
    attack: pctOf(base.attack, seals.at),
    atkSpeed: Math.floor(toNonNegativeNumber(seals.as)),
    critRate: pctOf(base.crit_rate, seals.ct),
    hitRate: Math.floor(toNonNegativeNumber(seals.ht)),
    defense: pctOf(base.defense, seals.de),
    blockRate: pctOf(base.block_rate, seals.bl),
    evasion: pctOf(base.evasion, seals.ev),
  }
}

export function getGearStatBonuses(base: WikiCombatBaseForSeals): GearStatBonuses {
  return resolveSealStatBonuses(readGearState().seals, base)
}

export function getGogglesAllStatBonuses(gear: GearState): Pick<GearStatBonuses, 'hp' | 'ds' | 'defense' | 'evasion'> {
  const allStat = Math.floor(toNonNegativeNumber(gear.left.goggles.allStat))
  return { hp: allStat, ds: allStat, defense: allStat, evasion: allStat }
}

function weightedLeftEquipmentStat(value: number): number {
  return Math.floor(toNonNegativeNumber(value) * LEFT_EQUIPMENT_ATTACK_WEIGHT)
}

/** Non-attack left equipment stats at 60% (goggles all stat at 100% is separate). */
export function getLeftEquipmentCombatBonuses(
  gear: GearState,
): Pick<GearStatBonuses, 'hp' | 'defense'> {
  const goggles = getGogglesAllStatBonuses(gear)
  const costumeHp = weightedLeftEquipmentStat(gear.left.costume.maxHp)
  const keyringHp = weightedLeftEquipmentStat(gear.left.keyring.maxHp)
  const keyringDef = weightedLeftEquipmentStat(gear.left.keyring.defense)
  return {
    hp: goggles.hp + costumeHp + keyringHp,
    defense: goggles.defense + keyringDef,
  }
}

export function getGearEquipmentCombatBonuses(
  gear: GearState,
): Pick<GearStatBonuses, 'hp' | 'ds' | 'defense' | 'evasion'> {
  const goggles = getGogglesAllStatBonuses(gear)
  const left = getLeftEquipmentCombatBonuses(gear)
  return {
    hp: left.hp,
    ds: goggles.ds,
    defense: left.defense,
    evasion: goggles.evasion,
  }
}

function leftPieceAttackAt60(gear: GearState, piece: LeftAttackAt60Piece): number {
  if (piece === 'costume') {
    return weightedLeftEquipmentStat(gear.left.costume.attack)
  }
  if (piece === 'keyring') {
    return weightedLeftEquipmentStat(gear.left.keyring.attack)
  }
  return weightedLeftEquipmentStat(gear.left[piece].attack)
}

export function gearAttackFromGearState(gear: GearState): GearAttackContribution {
  let leftWeightedAttack = 0
  for (const piece of LEFT_ATTACK_AT_60_PIECES) {
    leftWeightedAttack += leftPieceAttackAt60(gear, piece)
  }

  const gogglesAllStatAttack = Math.floor(toNonNegativeNumber(gear.left.goggles.allStat))

  return {
    leftWeightedAttack,
    gogglesAllStatAttack,
    totalAttack: leftWeightedAttack + gogglesAllStatAttack,
  }
}

export function getGearAttackContribution(): GearAttackContribution {
  return gearAttackFromGearState(readGearState())
}
