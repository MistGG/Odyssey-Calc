import { meterBarBackgroundForSkill } from '../lib/meterSkillBarGradient'
import {
  resolveDigimonPortraitUrl,
  resolveMemberPortraitUrl,
  resolveSkillIconUrl,
  type DigimonSkillBreakdownStored,
  type MeterParseDungeonStored,
  type MeterPartyMemberStored,
  type MeterSkillRow,
} from '../lib/meterParsePayload'
import { partyMemberBarBackground, partyMemberChromeStyle } from '../lib/meterPartyColor'

function formatInt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function difficultyTagClass(difficulty: string): string {
  const n = difficulty.trim().toLowerCase()
  if (n === 'story') return 'meter-parse-diff-tag meter-parse-diff-tag--story'
  if (n === 'normal') return 'meter-parse-diff-tag meter-parse-diff-tag--normal'
  if (n === 'hard') return 'meter-parse-diff-tag meter-parse-diff-tag--hard'
  return 'meter-parse-diff-tag meter-parse-diff-tag--other'
}

export function MeterRunMeta({
  dungeon,
  fallbackDungeonName,
  invalid = false,
  unranked = false,
}: {
  dungeon: MeterParseDungeonStored | null
  fallbackDungeonName?: string | null
  invalid?: boolean
  unranked?: boolean
}) {
  if (!dungeon && !fallbackDungeonName) return null
  const dungeonName = dungeon?.dungeonName?.trim() || fallbackDungeonName?.trim() || dungeon?.dungeonId || ''
  const difficulty = dungeon?.difficulty?.trim() || ''
  const bosses = dungeon?.bossTargets ?? []
  const outcome = dungeon?.runOutcome

  if (!dungeonName && !fallbackDungeonName && bosses.length === 0) return null

  return (
    <div className="meter-run-meta meter-run-meta--replay">
      {dungeonName ? (
        <div className="meter-run-meta__row">
          <span className="meter-run-meta__label">Dungeon</span>
          <span className="meter-run-meta__dungeon-line">
            <span className="meter-run-meta__value meter-run-meta__value--dungeon">{dungeonName}</span>
            {difficulty ? (
              <span className="meter-run-meta__difficulty">
                <span className={difficultyTagClass(difficulty)} title={`Difficulty: ${difficulty}`}>
                  {difficulty}
                </span>
              </span>
            ) : null}
          </span>
          {outcome === 'clear' ? <span className="meter-run-badge meter-run-badge--clear">Clear</span> : null}
          {outcome === 'fail' ? <span className="meter-run-badge meter-run-badge--fail">Fail</span> : null}
          {invalid ? (
            <span className="meter-run-badge meter-run-badge--invalid" title="Excluded from leaderboard">
              Invalid
            </span>
          ) : unranked ? (
            <span className="meter-run-badge meter-run-badge--invalid" title="Not a full boss clear — excluded from leaderboard">
              Unranked
            </span>
          ) : null}
        </div>
      ) : null}
      {bosses.length > 0 ? (
        <div className="meter-run-meta__row meter-run-meta__row--bosses">
          <span className="meter-run-meta__label">{bosses.length === 1 ? 'Boss' : 'Bosses'}</span>
          <span className="meter-run-meta__boss-list">
            {bosses.map((name) => (
              <span key={name} className="meter-run-meta__value meter-run-meta__value--boss">
                {name}
              </span>
            ))}
          </span>
        </div>
      ) : null}
    </div>
  )
}

export function MeterSkillBreakdown({
  skills,
  total,
  rowId,
}: {
  skills: MeterSkillRow[]
  total: number
  rowId: string
}) {
  if (!skills.length) {
    return <p className="meter-parses-muted meter-parses-meter-empty">No skills recorded.</p>
  }
  const sorted = [...skills].sort((a, b) => b.damage - a.damage)
  return (
    <div className="meter-breakdown-table meter-breakdown-table--compact">
      <div className="meter-breakdown-colhead meter-breakdown-colhead--compact meter-skill-colhead">
        <span>Skill</span>
        <span className="meter-col-num">Dmg</span>
        <span className="meter-col-pct">%</span>
        <span className="meter-col-hits">#</span>
      </div>
      <div className="meter-breakdown-scroll meter-breakdown-scroll--compact meter-scroll--themed">
        {sorted.map((s, idx) => {
          const pct = total > 0 ? (100 * s.damage) / total : 0
          const icon = resolveSkillIconUrl(s)
          return (
            <div key={`${rowId}-sk-${idx}`} className="meter-breakdown-row meter-breakdown-row--compact">
              <div
                className="meter-breakdown-bar"
                style={{
                  width: `${Math.min(100, pct)}%`,
                  background: meterBarBackgroundForSkill(s.skill),
                }}
                aria-hidden
              />
              <div className="meter-breakdown-row-grid meter-breakdown-row-grid--compact meter-breakdown-row-grid--skill">
                <span className="meter-breakdown-skill" title={s.skill}>
                  {icon ? (
                    <img className="meter-skill-icon" src={icon} alt="" width={22} height={22} />
                  ) : (
                    <span className="meter-skill-icon meter-skill-icon--empty" aria-hidden />
                  )}
                  <span className="meter-breakdown-skill-name">{s.skill}</span>
                </span>
                <span className="meter-breakdown-dmg">{formatInt(s.damage)}</span>
                <span className="meter-breakdown-share">{pct.toFixed(0)}</span>
                <span className="meter-breakdown-hits">{s.hits}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function MeterDigimonSkillGroups({
  digimons,
  memberTotal,
  rowId,
  memberKey,
}: {
  digimons: DigimonSkillBreakdownStored[]
  memberTotal: number
  rowId: string
  memberKey: string
}) {
  if (!digimons.length) {
    return <p className="meter-parses-muted meter-parses-meter-empty">No skill breakdown for this player.</p>
  }
  return (
    <div className="meter-breakdown-digimon-groups">
      {digimons.map((group) => {
        const portrait = resolveDigimonPortraitUrl(group)
        const groupShare = memberTotal > 0 ? (100 * group.totalDamage) / memberTotal : 0
        return (
          <div key={`${rowId}-${group.digimonId}`} className="meter-breakdown-digimon">
            <div className="meter-breakdown-digimon-head">
              {portrait ? (
                <img className="meter-party-portrait" src={portrait} alt="" width={20} height={20} />
              ) : (
                <span className="meter-party-portrait meter-party-portrait--empty" aria-hidden />
              )}
              <span className="meter-breakdown-digimon-name" title={group.digimonName}>
                {group.digimonName}
              </span>
              <span className="meter-breakdown-digimon-total">{formatInt(group.totalDamage)}</span>
              <span className="meter-breakdown-digimon-share muted">{groupShare.toFixed(0)}%</span>
            </div>
            <MeterSkillBreakdown
              skills={group.skills}
              total={group.totalDamage}
              rowId={`${rowId}-${memberKey}-${group.digimonId}`}
            />
          </div>
        )
      })}
    </div>
  )
}

export function MeterPartyRoster({
  members,
  raidTotal,
  selectedMemberKey,
  onSelectMember,
  getMemberNameColor,
}: {
  members: MeterPartyMemberStored[]
  raidTotal: number
  selectedMemberKey: string | null
  onSelectMember: (memberKey: string) => void
  /** Optional percentile tier color for player name (public leaderboard context). */
  getMemberNameColor?: (member: MeterPartyMemberStored, dps: number) => string | undefined
}) {
  const sorted = [...members].sort((a, b) => {
    const da = a.durationSec > 0 ? a.totalDamage / a.durationSec : 0
    const db = b.durationSec > 0 ? b.totalDamage / b.durationSec : 0
    return db - da
  })

  return (
    <div className="meter-breakdown-table meter-breakdown-table--compact meter-party">
      <div className="meter-breakdown-colhead meter-breakdown-colhead--compact meter-party-colhead">
        <span>Tamer</span>
        <span className="meter-col-num">DPS</span>
        <span className="meter-col-num">Total</span>
        <span className="meter-col-hits">s</span>
      </div>
      <div className="meter-breakdown-scroll meter-breakdown-scroll--compact meter-scroll--themed">
        {sorted.map((m) => {
          const dps = m.durationSec > 0 ? m.totalDamage / m.durationSec : 0
          const chrome = partyMemberChromeStyle(m.memberKey)
          const sharePct = raidTotal > 0 ? (100 * m.totalDamage) / raidTotal : 0
          const portrait = resolveMemberPortraitUrl(m)
          const tamer = m.tamerName?.trim() || m.displayLabel
          const digimon = m.currentDigimonName?.trim() || ''
          const active = selectedMemberKey === m.memberKey
          const nameColor = getMemberNameColor?.(m, dps)
          return (
            <button
              key={m.memberKey}
              type="button"
              className={`meter-party-member${active ? ' meter-party-member--active' : ''}`}
              style={{
                boxShadow: `inset 3px 0 0 ${chrome.borderLeftColor}`,
              }}
              onClick={() => onSelectMember(m.memberKey)}
            >
              <div
                className="meter-party-member-bar"
                style={{
                  width: `${Math.min(100, sharePct)}%`,
                  background: partyMemberBarBackground(m.memberKey),
                }}
                aria-hidden
              />
              <div className="meter-party-member-grid meter-party-member-grid--with-icon">
                <span className="meter-party-name" title={digimon ? `${tamer} — ${digimon}` : tamer}>
                  {portrait ? (
                    <img className="meter-party-portrait" src={portrait} alt="" width={22} height={22} />
                  ) : (
                    <span className="meter-party-portrait meter-party-portrait--empty" aria-hidden />
                  )}
                  <span className="meter-party-name-stack">
                    <span
                      className="meter-party-name-text"
                      style={nameColor ? { color: nameColor } : undefined}
                    >
                      {tamer}
                    </span>
                    {digimon ? <span className="meter-party-digimon">{digimon}</span> : null}
                  </span>
                </span>
                <span className="meter-party-num">{formatInt(dps)}</span>
                <span className="meter-party-num">{formatInt(m.totalDamage)}</span>
                <span className="meter-party-num">{m.durationSec.toFixed(0)}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function MeterMemberDetailHeader({
  member,
  onBack,
}: {
  member: MeterPartyMemberStored
  onBack: () => void
}) {
  const portrait = resolveMemberPortraitUrl(member)
  const tamer = member.tamerName?.trim() || member.displayLabel
  const digimon = member.currentDigimonName?.trim() || ''
  return (
    <div className="meter-party-back-row">
      <button
        type="button"
        className="meter-party-back"
        onClick={(e) => {
          e.stopPropagation()
          onBack()
        }}
      >
        ← Back
      </button>
      <span className="meter-party-detail-head">
        {portrait ? (
          <img className="meter-party-portrait" src={portrait} alt="" width={22} height={22} />
        ) : (
          <span className="meter-party-portrait meter-party-portrait--empty" aria-hidden />
        )}
        <span className="meter-party-detail-label" title={tamer}>
          {tamer}
          {digimon ? <span className="meter-party-digimon muted"> · {digimon}</span> : null}
        </span>
      </span>
    </div>
  )
}
