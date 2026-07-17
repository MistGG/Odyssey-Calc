import {
  MeterDigimonSkillGroups,
  MeterMemberDetailHeader,
  MeterPartyRoster,
  MeterRunMeta,
} from './MeterParseReplay'
import {
  dungeonFromPayload,
  isExcludedFromLeaderboardParseRow,
  isInvalidMeterPartyParseRow,
  memberDigimonBreakdowns,
  partyMembersFromPayload,
  parseClearTimeFromPayload,
  raidTotalFromPayload,
  dpsDurationFromPayload,
  type MeterParseDungeonStored,
  type MeterPartyMemberStored,
} from '../lib/meterParsePayload'
import {
  aggregatePublicMeterStats,
  memberNameColor,
  type PublicMeterParseRow,
} from '../lib/meterPublicStats'

function formatInt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function formatFixed(n: number, digits: number) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function MeterDungeonPartyReplay({
  row,
  publicRows,
  digimonRoleById,
  selectedMemberKey,
  onSelectMember,
  onBackFromMember,
  fallbackDungeonName,
}: {
  row: PublicMeterParseRow
  publicRows: PublicMeterParseRow[]
  digimonRoleById: Map<string, string>
  selectedMemberKey: string | null
  onSelectMember: (memberKey: string) => void
  onBackFromMember: () => void
  /** Wiki-resolved name when upload omitted `dungeon_name`. */
  fallbackDungeonName?: string | null
}) {
  const dungeon = dungeonFromPayload(row.payload)
  const members = partyMembersFromPayload(row.payload)
  const raidTotal = raidTotalFromPayload(row.payload, members)
  const dpsDur = dpsDurationFromPayload(row.payload, row.duration_sec, members)
  const clearTimeSec = parseClearTimeFromPayload(row.payload, row.duration_sec, members)
  const raidDps = dpsDur > 0 ? raidTotal / dpsDur : 0
  const sorted = [...members].sort((a, b) => {
    const da = a.durationSec > 0 ? a.totalDamage / a.durationSec : 0
    const db = b.durationSec > 0 ? b.totalDamage / b.durationSec : 0
    return db - da
  })
  const selected = selectedMemberKey
    ? members.find((m) => m.memberKey === selectedMemberKey)
    : null

  const nameColor = (m: MeterPartyMemberStored, _dps: number) => {
    const dId = row.dungeon_id ?? dungeon?.dungeonId
    const diffId = row.difficulty_id ?? dungeon?.difficultyId
    if (!dId || diffId == null || !digimonRoleById.size) return undefined
    const agg = aggregatePublicMeterStats(publicRows, digimonRoleById, dId, diffId)
    return memberNameColor(m, digimonRoleById, agg, {
      payload: row.payload,
      rowDurationSec: row.duration_sec,
      members,
    })
  }

  return (
    <div className="meter-parses-meter-chrome" aria-label="Dungeon party meter">
      <div className="meter-backdrop meter-backdrop--replay">
        <div className="meter-body meter-body--replay">
          <div className="meter-stats-row meter-stats-row--compact">
            <div className="meter-stat meter-stat--hero meter-stat--compact">
              <span className="meter-stat-label">DPS</span>
              <span className="meter-stat-value">{formatFixed(raidDps, 0)}</span>
            </div>
            <div className="meter-stat meter-stat--compact">
              <span className="meter-stat-label">TOTAL</span>
              <span className="meter-stat-value meter-stat-value--accent">{formatInt(raidTotal)}</span>
            </div>
            <div className="meter-stat meter-stat--compact">
              <span className="meter-stat-label">Clear</span>
              <span className="meter-stat-value">{clearTimeSec.toFixed(0)}s</span>
            </div>
            <div className="meter-stat meter-stat--compact">
              <span className="meter-stat-label">Players</span>
              <span className="meter-stat-value">{sorted.length}</span>
            </div>
          </div>
          <MeterRunMeta
            dungeon={dungeon as MeterParseDungeonStored | null}
            fallbackDungeonName={fallbackDungeonName ?? row.dungeon_name}
            invalid={isInvalidMeterPartyParseRow(row)}
            unranked={
              !isInvalidMeterPartyParseRow(row) && isExcludedFromLeaderboardParseRow(row)
            }
          />
          {!selected ? (
            <section className="meter-breakdown meter-breakdown--compact meter-party" aria-label="Party DPS">
              <MeterPartyRoster
                members={sorted}
                raidTotal={raidTotal}
                selectedMemberKey={selectedMemberKey}
                onSelectMember={onSelectMember}
                getMemberNameColor={nameColor}
                themeResolveKey={`${row.dungeon_id ?? ''}:${row.difficulty_id ?? ''}:${row.id}`}
              />
            </section>
          ) : (
            <>
              <MeterMemberDetailHeader member={selected} onBack={onBackFromMember} />
              <section className="meter-breakdown meter-breakdown--compact" aria-label="Skills by digimon">
                <MeterDigimonSkillGroups
                  digimons={memberDigimonBreakdowns(selected)}
                  memberTotal={selected.totalDamage}
                  rowId={row.id}
                  memberKey={selected.memberKey}
                />
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
