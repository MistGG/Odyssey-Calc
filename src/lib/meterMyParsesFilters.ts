import { dungeonFromPayload, isDungeonPartyParsePayload } from './meterParsePayload'
import type { PublicMeterParseRow } from './meterPublicStats'
import { difficultySelectOptions, dungeonSelectOptions } from './wikiDungeons'
import type { WikiDungeonListItem } from '../types/wikiApi'

export function dungeonParseRows(rows: PublicMeterParseRow[]): PublicMeterParseRow[] {
  return rows.filter((r) => isDungeonPartyParsePayload(r.payload))
}

export function filterMyDungeonParses(
  rows: PublicMeterParseRow[],
  dungeonId: string,
  difficultyId: number | null,
): PublicMeterParseRow[] {
  return dungeonParseRows(rows).filter((r) => {
    const dId = r.dungeon_id?.trim() ?? dungeonFromPayload(r.payload)?.dungeonId
    const diffId = r.difficulty_id ?? dungeonFromPayload(r.payload)?.difficultyId
    if (dungeonId && dId !== dungeonId) return false
    if (difficultyId != null && diffId !== difficultyId) return false
    return true
  })
}

export { dungeonSelectOptions, difficultySelectOptions }

export type { WikiDungeonListItem }
