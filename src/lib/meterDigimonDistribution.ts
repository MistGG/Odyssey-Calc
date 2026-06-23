import { digimonPortraitUrl } from './digimonImage'
import { fetchOfficialDigimonInfoByIds } from './meterParseDigimonNames'
import { getMeterAnonSupabase } from './meterDataSource'
import { METER_ROLE_BUCKETS, type MeterRoleBucket } from './meterRoleBuckets'

const MIN_PARSES_FOR_SERIES = 3
export const METER_DIGIMON_CHART_MAX_SERIES = 10
const MAX_SERIES_PER_ROLE = METER_DIGIMON_CHART_MAX_SERIES
const DISTRIBUTION_PAGE_SIZE = 1000
const DISTRIBUTION_MAX_ROWS = 50_000

export type DigimonBoxPlot = {
  q1: number
  median: number
  q3: number
  whiskerMin: number
  whiskerMax: number
  outliers: number[]
}

export type DigimonDistributionSeries = {
  digimonId: string
  digimonName: string
  iconId: string | null
  portraitUrl?: string
  parseCount: number
  medianScore: number
  maxScore: number
  bestDps: number
  averageDps: number
  lowestDps: number
  box: DigimonBoxPlot
}

export type DigimonDistributionByBucket = Record<MeterRoleBucket, DigimonDistributionSeries[]>

type SampleRow = {
  role_bucket: string
  digimon_id: string
  digimon_name: string
  icon_id: string | null
  portrait_url: string | null
  dps: number
}

function emptyBucketRecord<T>(): Record<MeterRoleBucket, T> {
  return {
    melee: [] as T,
    ranged: [] as T,
    caster: [] as T,
    hybrid: [] as T,
    tank: [] as T,
    healer: [] as T,
  }
}

function isRoleBucket(value: string): value is MeterRoleBucket {
  return (METER_ROLE_BUCKETS as readonly string[]).includes(value)
}

function percentileValue(sorted: number[], percentile: number): number {
  if (!sorted.length) return 0
  if (sorted.length === 1) return sorted[0]!
  const idx = (percentile / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]!
  const weight = idx - lo
  return sorted[lo]! * (1 - weight) + sorted[hi]! * weight
}

function dpsToScore(dps: number, scaleMax: number): number {
  return Math.min(100, (dps / scaleMax) * 100)
}

export function buildBoxPlotFromDps(sortedDps: number[], scaleMax: number): DigimonBoxPlot {
  const scores = sortedDps.map((dps) => dpsToScore(dps, scaleMax)).sort((a, b) => a - b)
  const q1 = percentileValue(scores, 25)
  const median = percentileValue(scores, 50)
  const q3 = percentileValue(scores, 75)
  const iqr = q3 - q1
  const lowerFence = q1 - 1.5 * iqr
  const upperFence = q3 + 1.5 * iqr

  const inRange = scores.filter((score) => score >= lowerFence && score <= upperFence)
  const whiskerMin = inRange.length ? inRange[0]! : scores[0]!
  const whiskerMax = inRange.length ? inRange[inRange.length - 1]! : scores[scores.length - 1]!
  const outliers = scores.filter((score) => score < lowerFence || score > upperFence)

  return { q1, median, q3, whiskerMin, whiskerMax, outliers }
}

type DigimonSampleAccumulator = {
  digimonId: string
  digimonName: string
  iconId: string | null
  portraitUrl?: string
  dpsValues: number[]
}

export function buildDigimonDistributionSeries(
  samples: DigimonSampleAccumulator[],
  roleMaxDps: number,
): DigimonDistributionSeries[] {
  const scaleMax = roleMaxDps > 0 ? roleMaxDps : 1

  return samples
    .filter((s) => s.dpsValues.length >= MIN_PARSES_FOR_SERIES)
    .map((sample) => {
      const sorted = [...sample.dpsValues].sort((a, b) => a - b)
      const box = buildBoxPlotFromDps(sorted, scaleMax)
      const bestDps = sorted[sorted.length - 1]!
      const lowestDps = sorted[0]!
      const averageDps = sorted.reduce((sum, dps) => sum + dps, 0) / sorted.length
      const maxScore = dpsToScore(bestDps, scaleMax)
      return {
        digimonId: sample.digimonId,
        digimonName: sample.digimonName,
        iconId: sample.iconId,
        portraitUrl: sample.portraitUrl,
        parseCount: sorted.length,
        medianScore: box.median,
        maxScore,
        bestDps,
        averageDps,
        lowestDps,
        box,
      }
    })
    .sort((a, b) => b.medianScore - a.medianScore || b.parseCount - a.parseCount)
    .slice(0, MAX_SERIES_PER_ROLE)
}

async function resolveDigimonDistributionPortraits(
  byBucket: DigimonDistributionByBucket,
): Promise<DigimonDistributionByBucket> {
  const idSet = new Set<string>()
  for (const bucket of METER_ROLE_BUCKETS) {
    for (const series of byBucket[bucket]) {
      const id = series.digimonId.trim()
      if (!id || id === 'unknown') continue
      if (series.portraitUrl?.trim()) continue
      if (series.iconId?.trim()) continue
      idSet.add(id)
    }
  }
  if (!idSet.size) return byBucket

  const officialById = await fetchOfficialDigimonInfoByIds([...idSet])
  if (!officialById.size) return byBucket

  const resolved = emptyBucketRecord<DigimonDistributionSeries[]>()
  for (const bucket of METER_ROLE_BUCKETS) {
    resolved[bucket] = byBucket[bucket].map((series) => {
      const id = series.digimonId.trim()
      const info = officialById.get(id)
      if (!info?.modelId) return series
      return {
        ...series,
        digimonName: info.name || series.digimonName,
        iconId: info.modelId,
        portraitUrl: digimonPortraitUrl(info.modelId, id, info.name || series.digimonName),
      }
    })
  }
  return resolved
}

export async function fetchDigimonDistributionInWindow(params: {
  dungeonId: string
  difficultyId: number
  windowStart?: string | null
  windowEnd?: string | null
}): Promise<{ byBucket: DigimonDistributionByBucket; error: string | null }> {
  const supabase = getMeterAnonSupabase()
  const empty = emptyBucketRecord<DigimonDistributionSeries[]>()
  if (!supabase) return { byBucket: empty, error: 'Supabase is not configured.' }

  const dungeonId = params.dungeonId.trim()
  if (!dungeonId || params.difficultyId < 2) {
    return { byBucket: empty, error: 'Select a dungeon and difficulty.' }
  }

  const rows: SampleRow[] = []
  let offset = 0

  while (offset < DISTRIBUTION_MAX_ROWS) {
    let pageQuery = supabase
      .from('meter_leaderboard_entries')
      .select('role_bucket, digimon_id, digimon_name, icon_id, portrait_url, dps')
      .eq('dungeon_id', dungeonId)
      .eq('difficulty_id', params.difficultyId)
      .gt('dps', 0)

    if (params.windowStart) {
      pageQuery = pageQuery.gte('created_at', params.windowStart)
    }
    if (params.windowEnd) {
      pageQuery = pageQuery.lt('created_at', params.windowEnd)
    }

    const to = offset + DISTRIBUTION_PAGE_SIZE - 1
    const { data, error } = await pageQuery.range(offset, to)
    if (error) return { byBucket: empty, error: error.message }

    const page = (data ?? []) as SampleRow[]
    if (!page.length) break
    rows.push(...page)
    if (page.length < DISTRIBUTION_PAGE_SIZE) break
    offset += DISTRIBUTION_PAGE_SIZE
  }

  const grouped = emptyBucketRecord<Map<string, DigimonSampleAccumulator>>()
  for (const bucket of METER_ROLE_BUCKETS) {
    grouped[bucket] = new Map()
  }

  for (const raw of rows) {
    if (!isRoleBucket(raw.role_bucket)) continue
    const digimonId = raw.digimon_id?.trim()
    if (!digimonId) continue
    const dps = Number(raw.dps)
    if (!Number.isFinite(dps) || dps <= 0) continue

    const map = grouped[raw.role_bucket]
    const prev = map.get(digimonId)
    if (!prev) {
      map.set(digimonId, {
        digimonId,
        digimonName: raw.digimon_name?.trim() || digimonId,
        iconId: raw.icon_id,
        portraitUrl: raw.portrait_url ?? undefined,
        dpsValues: [dps],
      })
    } else {
      prev.dpsValues.push(dps)
      if (raw.digimon_name?.trim()) prev.digimonName = raw.digimon_name.trim()
      if (raw.icon_id) prev.iconId = raw.icon_id
      if (raw.portrait_url) prev.portraitUrl = raw.portrait_url
    }
  }

  const byBucket = emptyBucketRecord<DigimonDistributionSeries[]>()
  for (const bucket of METER_ROLE_BUCKETS) {
    const samples = [...grouped[bucket].values()]
    const roleMaxDps = samples.reduce((max, s) => {
      const localMax = s.dpsValues.length ? Math.max(...s.dpsValues) : 0
      return Math.max(max, localMax)
    }, 0)
    byBucket[bucket] = buildDigimonDistributionSeries(samples, roleMaxDps)
  }

  try {
    return { byBucket: await resolveDigimonDistributionPortraits(byBucket), error: null }
  } catch {
    return { byBucket, error: null }
  }
}
