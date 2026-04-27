export const GEAR_STORAGE_KEY = 'gear-v1'

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
