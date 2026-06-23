import { digimonPortraitUrl } from './digimonImage'
import { fetchOfficialDigimonInfoByIds } from './meterParseDigimonNames'
import { getMeterAnonSupabase } from './meterDataSource'
import { METER_ROLE_BUCKETS, type MeterRoleBucket } from './meterRoleBuckets'

export type PlayerPartyMateIcon = {
  playerKey: string
  displayName: string
  digimonId: string
  digimonName: string
  iconId: string | null
  portraitUrl?: string
}

export type PlayerPartyMatesByBucket = Record<MeterRoleBucket, Record<string, PlayerPartyMateIcon[]>>

type PartyMateRow = {
  role_bucket: string
  player_key: string
  mate_player_key: string
  mate_display_name: string
  digimon_id: string
  digimon_name: string
  icon_id: string | null
  portrait_url: string | null
  mate_order: number
}

function emptyMatesByBucket(): PlayerPartyMatesByBucket {
  return {
    melee: {},
    ranged: {},
    caster: {},
    hybrid: {},
    tank: {},
    healer: {},
  }
}

function isRoleBucket(value: string): value is MeterRoleBucket {
  return (METER_ROLE_BUCKETS as readonly string[]).includes(value)
}

function matePortrait(mate: PlayerPartyMateIcon): string | undefined {
  if (mate.portraitUrl?.trim()) return mate.portraitUrl
  const iconId = mate.iconId?.trim()
  if (iconId) return digimonPortraitUrl(iconId, mate.digimonId, mate.digimonName)
  return undefined
}

async function resolvePartyMatePortraits(
  byBucket: PlayerPartyMatesByBucket,
): Promise<PlayerPartyMatesByBucket> {
  const ids = new Set<string>()
  for (const bucket of METER_ROLE_BUCKETS) {
    for (const mates of Object.values(byBucket[bucket])) {
      for (const mate of mates) {
        const id = mate.digimonId.trim()
        if (id && id !== 'unknown' && !matePortrait(mate)) ids.add(id)
      }
    }
  }
  if (!ids.size) return byBucket

  const officialById = await fetchOfficialDigimonInfoByIds([...ids])
  if (!officialById.size) return byBucket

  const resolved = emptyMatesByBucket()
  for (const bucket of METER_ROLE_BUCKETS) {
    for (const [playerKey, mates] of Object.entries(byBucket[bucket])) {
      resolved[bucket][playerKey] = mates.map((mate) => {
        const id = mate.digimonId.trim()
        const info = officialById.get(id)
        if (!info?.modelId) return mate
        return {
          ...mate,
          digimonName: info.name || mate.digimonName,
          iconId: info.modelId,
          portraitUrl: digimonPortraitUrl(info.modelId, id, info.name || mate.digimonName),
        }
      })
    }
  }
  return resolved
}

export async function fetchLeaderboardPartyMates(params: {
  dungeonId: string
  difficultyId: number
  windowStart?: string | null
  windowEnd?: string | null
}): Promise<{ byBucket: PlayerPartyMatesByBucket; error: string | null }> {
  const empty = emptyMatesByBucket()
  const supabase = getMeterAnonSupabase()
  if (!supabase) return { byBucket: empty, error: 'Supabase is not configured.' }

  const dungeonId = params.dungeonId.trim()
  if (!dungeonId || params.difficultyId < 2) {
    return { byBucket: empty, error: null }
  }

  const { data, error } = await supabase.rpc('get_meter_leaderboard_party_mates', {
    p_dungeon_id: dungeonId,
    p_difficulty_id: params.difficultyId,
    p_window_start: params.windowStart ?? null,
    p_window_end: params.windowEnd ?? null,
  })

  if (error) {
    if (/could not find the function|schema cache/i.test(error.message)) {
      return { byBucket: empty, error: null }
    }
    return { byBucket: empty, error: error.message }
  }

  const byBucket = emptyMatesByBucket()
  for (const raw of (data ?? []) as PartyMateRow[]) {
    if (!isRoleBucket(raw.role_bucket)) continue
    const playerKey = raw.player_key?.trim().toLowerCase()
    const mateKey = raw.mate_player_key?.trim().toLowerCase()
    const digimonId = raw.digimon_id?.trim()
    if (!playerKey || !mateKey || !digimonId) continue

    const bucketMap = byBucket[raw.role_bucket]
    const prev = bucketMap[playerKey] ?? []
    if (prev.some((mate) => mate.playerKey === mateKey)) continue

    bucketMap[playerKey] = [
      ...prev,
      {
        playerKey: mateKey,
        displayName: raw.mate_display_name?.trim() || mateKey,
        digimonId,
        digimonName: raw.digimon_name?.trim() || digimonId,
        iconId: raw.icon_id,
        portraitUrl: raw.portrait_url ?? undefined,
      },
    ]
  }

  try {
    const resolved = await resolvePartyMatePortraits(byBucket)
    return { byBucket: resolved, error: null }
  } catch {
    return { byBucket, error: null }
  }
}

export function portraitForPartyMate(mate: PlayerPartyMateIcon): string | undefined {
  return matePortrait(mate)
}
