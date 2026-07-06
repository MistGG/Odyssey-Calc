import { digimonPortraitUrl } from './digimonImage'
import { resolveEffectiveDigimonIdentity } from './resolveDigimonAlternateStructure'
import { getMeterAnonSupabase } from './meterDataSource'
import { fetchWikiDigimonCatalog, METER_ROLE_BUCKETS, wikiRoleToBucket, type MeterRoleBucket } from './meterRoleBuckets'

export type PlayerPartyMateIcon = {
  playerKey: string
  displayName: string
  digimonId: string
  digimonName: string
  iconId: string | null
  portraitUrl?: string
  /** Processed leaderboard role for this mate on the ranked parse. */
  roleBucket?: MeterRoleBucket | null
}

export type PlayerPartySnapshot = {
  mates: PlayerPartyMateIcon[]
  /** Clear time for the ranked parse, when available from the API. */
  durationSec: number | null
}

export type PlayerPartyMatesByBucket = Record<MeterRoleBucket, Record<string, PlayerPartySnapshot>>

const EMPTY_PARTY_SNAPSHOT: PlayerPartySnapshot = { mates: [], durationSec: null }

export function formatMeterClearTime(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec <= 0) return ''
  const sec = Math.round(totalSec)
  const minutes = Math.floor(sec / 60)
  const seconds = sec % 60
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

type PartyMateRow = {
  role_bucket: string
  player_key: string
  mate_player_key: string
  mate_display_name: string
  digimon_id: string
  digimon_name: string
  icon_id: string | null
  portrait_url: string | null
  skill_keys?: string[] | null
  mate_role_bucket?: string | null
  mate_order: number
  parse_duration_sec?: number | string | null
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

function parseSkillKeys(raw: PartyMateRow['skill_keys']): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((key) => (typeof key === 'string' ? key.trim().toLowerCase() : ''))
    .filter((key) => key && key !== '(basic)')
}

async function resolvePartyMateIdentity(
  mate: PlayerPartyMateIcon,
  skillKeys: string[],
  fromLeaderboard: boolean,
): Promise<PlayerPartyMateIcon> {
  if (fromLeaderboard && mate.digimonId.trim() && mate.digimonName.trim()) {
    return {
      ...mate,
      portraitUrl: mate.portraitUrl ?? (mate.iconId ? digimonPortraitUrl(mate.iconId, mate.digimonId, mate.digimonName) : undefined),
    }
  }

  const catalog = await fetchWikiDigimonCatalog()
  const parentEntry = catalog.get(mate.digimonId.trim())
  const effective = await resolveEffectiveDigimonIdentity({
    digimonId: mate.digimonId,
    iconId: mate.iconId,
    digimonName: mate.digimonName,
    parentModelId: parentEntry?.modelId || null,
    skillKeys,
  })
  const portraitUrl = effective.iconId
    ? digimonPortraitUrl(effective.iconId, effective.digimonId, effective.digimonName)
    : mate.portraitUrl
  const resolvedRoleBucket = wikiRoleToBucket(effective.wikiRole)
  return {
    ...mate,
    digimonId: effective.digimonId,
    digimonName: effective.digimonName,
    iconId: effective.iconId,
    portraitUrl,
    roleBucket: mate.roleBucket ?? resolvedRoleBucket,
  }
}

async function resolvePartyMatePortraits(
  byBucket: PlayerPartyMatesByBucket,
  skillKeysByMate: Map<string, string[]>,
  leaderboardMateKeys: Set<string>,
): Promise<PlayerPartyMatesByBucket> {
  const resolved = emptyMatesByBucket()
  for (const bucket of METER_ROLE_BUCKETS) {
    for (const [playerKey, snapshot] of Object.entries(byBucket[bucket])) {
      const mates = await Promise.all(
        snapshot.mates.map((mate) => {
          const mateKey = `${bucket}:${playerKey}:${mate.playerKey}`
          return resolvePartyMateIdentity(
            mate,
            skillKeysByMate.get(mateKey) ?? [],
            leaderboardMateKeys.has(mateKey),
          )
        }),
      )
      resolved[bucket][playerKey] = {
        durationSec: snapshot.durationSec,
        mates,
      }
    }
  }
  return resolved
}

function parseDurationSec(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
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
  const skillKeysByMate = new Map<string, string[]>()
  const leaderboardMateKeys = new Set<string>()
  for (const raw of (data ?? []) as PartyMateRow[]) {
    if (!isRoleBucket(raw.role_bucket)) continue
    const playerKey = raw.player_key?.trim().toLowerCase()
    const mateKey = raw.mate_player_key?.trim().toLowerCase()
    const digimonId = raw.digimon_id?.trim()
    if (!playerKey || !mateKey || !digimonId) continue

    const bucketMap = byBucket[raw.role_bucket]
    const prev = bucketMap[playerKey] ?? EMPTY_PARTY_SNAPSHOT
    if (prev.mates.some((mate) => mate.playerKey === mateKey)) continue

    const skillKeys = parseSkillKeys(raw.skill_keys)
    const mateMapKey = `${raw.role_bucket}:${playerKey}:${mateKey}`
    skillKeysByMate.set(mateMapKey, skillKeys)

    const mateRoleBucket = raw.mate_role_bucket?.trim().toLowerCase()
    if (mateRoleBucket && isRoleBucket(mateRoleBucket)) {
      leaderboardMateKeys.add(mateMapKey)
    }
    const durationSec = parseDurationSec(raw.parse_duration_sec) ?? prev.durationSec
    bucketMap[playerKey] = {
      durationSec,
      mates: [
        ...prev.mates,
        {
          playerKey: mateKey,
          displayName: raw.mate_display_name?.trim() || mateKey,
          digimonId,
          digimonName: raw.digimon_name?.trim() || digimonId,
          iconId: raw.icon_id,
          portraitUrl: raw.portrait_url ?? undefined,
          roleBucket: mateRoleBucket && isRoleBucket(mateRoleBucket) ? mateRoleBucket : null,
        },
      ],
    }
  }

  try {
    const resolved = await resolvePartyMatePortraits(byBucket, skillKeysByMate, leaderboardMateKeys)
    return { byBucket: resolved, error: null }
  } catch {
    return { byBucket, error: null }
  }
}

export function portraitForPartyMate(mate: PlayerPartyMateIcon): string | undefined {
  return matePortrait(mate)
}
