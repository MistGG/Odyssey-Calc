import { BURST_DPS_WINDOW_SEC } from '../../lib/dpsTierScore'
import { DEFAULT_ROTATION_SIM_DURATION_SEC } from '../../lib/dpsSim'
import type { TierListMode } from '../../lib/tierList'

type Props = {
  tierMode: TierListMode
  dpsScoresStale: boolean
  tankScoresStale: boolean
  healerScoresStale: boolean
}

export function TierListScoringNotes({
  tierMode,
  dpsScoresStale,
  tankScoresStale,
  healerScoresStale,
}: Props) {
  return (
    <>
      {tierMode === 'dps' ? (
        <>
          <p className="tier-wip-note" role="status">
            DPS sims and specialized heuristics are a <strong>work in progress</strong>.
          </p>
          <details className="tier-score-explainer">
            <summary>DPS Scoring</summary>
            <div className="tier-score-explainer-body">
              <ul className="tier-score-explainer-list">
                <li>
                  <strong>Sustained:</strong> same simulation as Lab default — greedy rotation over{' '}
                  {DEFAULT_ROTATION_SIM_DURATION_SEC}s, Hybrid uses best stance.
                </li>
                <li>
                  <strong>Burst ({BURST_DPS_WINDOW_SEC}s):</strong> same rotation rules with a shorter
                  horizon (openers / short burst bias).
                </li>
                <li>
                  <strong>AoE:</strong> choose the <strong>AoE</strong> sub-tab to open a four-column matrix
                  (General, Damage, Cooldown, Farming). Only skills with wiki <code>radius</code> &gt; 0 (same
                  as the AOE tag on the detail page). <strong>Damage</strong> column: <code>log1p</code> of summed
                  per-cast damage; <strong>Cooldown</strong>: <code>log1p</code> of summed{' '}
                  <code>1 / (cast + cooldown)</code>. <strong>Farming</strong> assumes packs respawn about every
                  8s: each AoE line contributes damage (plus a small cast-density bonus) times a{' '}
                  <strong>respawn fit</strong> weight <code>exp(-max(0, period - 8) / 8)</code> for{' '}
                  <code>period = cast + cooldown</code>, times a light <code>log1p(radius)</code> coverage factor.
                  Support-only AoE uses a smaller area+cadence term instead of damage. <strong>General</strong> is the
                  average of Damage, Cooldown, and Farming (equal weight).
                </li>
                <li>
                  <strong>Specialized:</strong> <code>log1p(DEX/120 + 6×groupBuffSignals)</code>. A &quot;group
                  buff&quot; signal is any support-only skill (no damage scaling) with wiki radius &gt; 0 and/or
                  party/allies/group-style wording in skill or buff text.
                </li>
              </ul>
            </div>
          </details>
          {dpsScoresStale && (
            <p className="tier-stale-note" role="status">
              Some rows are missing DPS category scores. Run <strong>Update tier list</strong> (or{' '}
              <strong>Force check all</strong>) to recalculate.
            </p>
          )}
        </>
      ) : null}
      {tierMode === 'tank' ? (
        <>
          <p className="tier-wip-note" role="status">
            Tank tier list is a <strong>very large work in progress</strong>; scores and ordering can change
            substantially as formulas and parsing improve.
          </p>
          <details className="tier-score-explainer">
            <summary>Tank Scoring</summary>
            <div className="tier-score-explainer-body">
              <ul className="tier-score-explainer-list">
                <li>Parses skill/buff text and numbers, mixes in base stats; used only to order rows.</li>
                <li>Base HP (~65%): wiki combat max HP — main tankiness signal.</li>
                <li>
                  Mitigation (~22%): damage reduction, shields, heals, Max HP% from skills — each scaled by
                  estimated uptime (buff duration ÷ cooldown+cast, max 100%; fallback if duration missing).
                </li>
                <li>Defense (~9%): defense × 6, then scaled like HP (log1p(defenseRaw/1000)).</li>
                <li>Avoidance (~4%): block + evasion (down-weighted).</li>
                <li>
                  Combined with <code>log1p</code> so one huge value does not decide everything:{' '}
                  <code>
                    0.65·log1p(HP/1000) + 0.22·log1p(mit) + 0.09·log1p(def×6/1000) + 0.04·log1p(avoid)
                  </code>
                  .
                </li>
                <li>
                  S/A/B/C: same cutoffs as DPS (~10% / ~20% / ~30% / rest) within each column among filtered Tanks
                  (order differs per column).
                </li>
                <li>
                  <strong>Overall</strong> is a calculation of all parameters.{' '}
                  <strong>Effective HP / Defense / Evasion / Block</strong> columns show wiki base plus
                  uptime-weighted parsed buffs to that stat (same linear sum the column sort is derived from,
                  before <code>log1p</code>).
                </li>
                <li>
                  Limits: imperfect text parsing; no party vs self, overheal, or enemy modeling. Refresh scores
                  after wiki changes via Update tier list.
                </li>
              </ul>
            </div>
          </details>
          {tankScoresStale && (
            <p className="tier-stale-note" role="status">
              Some rows are missing tank scores. Run <strong>Update tier list</strong> (or{' '}
              <strong>Force check all</strong>) to recalculate.
            </p>
          )}
        </>
      ) : null}
      {tierMode === 'healer' ? (
        <>
          <p className="tier-wip-note" role="status">
            Healer tier list is a <strong>very large work in progress</strong>; scores and ordering can change
            substantially as formulas and parsing improve.
          </p>
          <details className="tier-score-explainer">
            <summary>Healer Scoring</summary>
            <div className="tier-score-explainer-body">
              <ul className="tier-score-explainer-list">
                <li>
                  Healing (~74%): Each skill with heal text contributes HP per cast ÷ (cooldown + cast, min
                  0.75s). Per cast: % lines use this Digimon&apos;s max HP as the scale; flat lines use the number
                  as-is. Those rates are summed across heal skills (simple sustain, not a full rotation solver).
                </li>
                <li>
                  Shields and damage reduction (~16%): barriers and DR only (healing not counted again here),
                  still using buff uptime vs cooldown.
                </li>
                <li>
                  Damage buffs in the <strong>Overall</strong> score (~7% weight): parsed skill damage %, ATK%,
                  crit rate/damage %, attack speed %, and flat ATK — each turned into a small internal “buff
                  strength” number with different weights per stat type, then <code>log1p</code> for the composite.
                </li>
                <li>INT (~3%): small tie-breaker from wiki combat stats.</li>
                <li>
                  Blend with <code>log1p</code>:{' '}
                  <code>0.74·log1p(heal/s) + 0.16·log1p(mit) + 0.07·log1p(buff) + 0.03·log1p(INT)</code>.
                </li>
                <li>
                  S/A/B/C: same cutoffs as DPS within each column among filtered Support rows (order differs per
                  column).
                </li>
                <li>
                  <strong>Overall</strong> is a calculation of all parameters. <strong>Healing</strong> shows
                  modeled HPS; <strong>Shielding</strong> shows modeled SPS (barrier strength per second).{' '}
                  <strong>INT</strong> is wiki combat INT.
                </li>
                <li>
                  <strong>Buffing</strong> column (the integer in the matrix): for each offensive buff line we
                  parse (same families as above), we add <strong>wiki value × estimated buff uptime</strong>{' '}
                  (uptime uses buff duration vs skill cooldown+cast, like mitigation). For <strong>%</strong> lines
                  that is literally “percentage points × uptime” (e.g. +20% ATK half the time adds ~10 to the sum).
                  <strong>Flat attack</strong> lines add <code>flat × 0.02 × uptime</code> so they sit on a similar
                  scale to percentages — that 0.02 is a model choice, not an in-game conversion.{' '}
                  <strong>Everything stacks across all skills</strong>, so the total is <strong>not</strong> “your
                  party deals X% more damage,” can exceed 100, and is only a <strong>relative buff-density score</strong>{' '}
                  for sorting and comparison.
                </li>
                <li>
                  Limits: adding all heal skills can overstate if they share one GCD; HoTs, targets, DS heals,
                  passives not modeled; odd skill text may parse wrong.
                </li>
              </ul>
            </div>
          </details>
          {healerScoresStale && (
            <p className="tier-stale-note" role="status">
              Some rows are missing healer scores. Run <strong>Update tier list</strong> (or{' '}
              <strong>Force check all</strong>) to recalculate.
            </p>
          )}
        </>
      ) : null}
    </>
  )
}
