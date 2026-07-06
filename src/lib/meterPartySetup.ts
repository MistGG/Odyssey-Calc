import type { PlayerPartySnapshot } from './meterLeaderboardPartyMates'
import type { PlayerRankEntry } from './meterPublicStats'
import { digimonIdToBucket, type MeterRoleBucket } from './meterRoleBuckets'

export type MeterPartySetupFilter = 'standard' | 'non-standard'

export function isStandardPartySetup(roleBuckets: MeterRoleBucket[]): boolean {
  let tankCount = 0
  let healerCount = 0
  for (const bucket of roleBuckets) {
    if (bucket === 'tank') tankCount += 1
    else if (bucket === 'healer') healerCount += 1
  }
  return tankCount === 1 && healerCount === 1
}

export function partyRoleBucketsForEntry(
  playerRoleBucket: MeterRoleBucket,
  party: PlayerPartySnapshot,
  roleMap: Map<string, string>,
): MeterRoleBucket[] | null {
  const roles: MeterRoleBucket[] = [playerRoleBucket]
  for (const mate of party.mates) {
    if (mate.roleBucket) {
      roles.push(mate.roleBucket)
      continue
    }
    const id = mate.digimonId.trim()
    if (!id) return null
    const bucket = digimonIdToBucket(id, roleMap)
    if (!bucket) return null
    roles.push(bucket)
  }
  return roles
}

export function entryMatchesPartySetupFilter(
  filter: MeterPartySetupFilter,
  playerRoleBucket: MeterRoleBucket,
  party: PlayerPartySnapshot,
  roleMap: Map<string, string> | null,
): boolean {
  if (!roleMap?.size) return true

  const roles = partyRoleBucketsForEntry(playerRoleBucket, party, roleMap)
  if (!roles) return filter === 'non-standard'

  const standard = isStandardPartySetup(roles)
  return filter === 'standard' ? standard : !standard
}

export function filterTamerEntriesByPartySetup(
  entries: PlayerRankEntry[],
  bucket: MeterRoleBucket,
  partyMates: Record<string, PlayerPartySnapshot>,
  filter: MeterPartySetupFilter,
  roleMap: Map<string, string> | null,
): PlayerRankEntry[] {
  return entries.filter((entry) => {
    const party = partyMates[entry.playerKey] ?? { mates: [], durationSec: null }
    return entryMatchesPartySetupFilter(filter, bucket, party, roleMap)
  })
}
