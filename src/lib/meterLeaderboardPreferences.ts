const SHOW_DIGIMON_STATS_KEY = 'odyssey-meter-show-digimon-stats-v1'

export function readMeterShowDigimonStats(): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    const raw = localStorage.getItem(SHOW_DIGIMON_STATS_KEY)
    return raw === '1' || raw === 'true'
  } catch {
    return false
  }
}

export function writeMeterShowDigimonStats(show: boolean): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(SHOW_DIGIMON_STATS_KEY, show ? '1' : '0')
  } catch {
    /* quota */
  }
}
