/** WoW-style parse tier colors by percentile (0–100). */
export function parseScoreColor(percentile: number): string {
  const p = Math.round(Math.min(100, Math.max(0, percentile)))
  if (p >= 100) return '#e5cc80'
  if (p >= 99) return '#e268a8'
  if (p >= 95) return '#ff8000'
  if (p >= 75) return '#a335ee'
  if (p >= 50) return '#0070ff'
  if (p >= 25) return '#1eff00'
  return '#666666'
}

/** Percentile 0–100 from position in ascending DPS distribution. */
export function dpsToPercentile(dps: number, sortedDpsAsc: number[]): number {
  const arr = sortedDpsAsc.filter((x) => Number.isFinite(x))
  const n = arr.length
  if (n === 0) return 0
  if (n === 1) return dps >= arr[0]! ? 100 : 0
  let below = 0
  for (const v of arr) {
    if (v < dps) below++
  }
  return Math.min(100, Math.max(0, Math.round((below / (n - 1)) * 100)))
}

/** Percentile when leaderboard is sorted descending (best first). */
export function dpsToPercentileDesc(dps: number, sortedDpsDesc: number[]): number {
  const asc = [...sortedDpsDesc].sort((a, b) => a - b)
  return dpsToPercentile(dps, asc)
}
