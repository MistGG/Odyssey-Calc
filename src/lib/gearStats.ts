const GEAR_STORAGE_KEY = 'gear-v1'

type LeftPiece = 'head-goggles' | 'fashion' | 'top' | 'bottom' | 'gloves' | 'shoes'
type LeftStat = 'maxDs' | 'maxHp' | 'defense' | 'attack' | 'moveSpeed'
type RingStat = 'attack' | 'basicAttribute' | 'critical' | 'defense' | 'maxDs' | 'maxHp' | 'skill'

type LeftPieceStats = Record<LeftStat, number>
type LeftGearState = Record<LeftPiece, LeftPieceStats>
type RingLine = { stat: RingStat | ''; value: number }
type GearState = {
  left: LeftGearState
  ring: RingLine[]
}

export type GearAttackContribution = {
  ringAttack: number
  leftWeightedAttack: number
  totalAttack: number
}

const LEFT_PIECES: LeftPiece[] = ['head-goggles', 'fashion', 'top', 'bottom', 'gloves', 'shoes']
const RING_STATS: RingStat[] = ['attack', 'basicAttribute', 'critical', 'defense', 'maxDs', 'maxHp', 'skill']

function toNonNegativeNumber(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

function readGearState(): Partial<GearState> | null {
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

export function getGearAttackContribution(): GearAttackContribution {
  const parsed = readGearState()
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
