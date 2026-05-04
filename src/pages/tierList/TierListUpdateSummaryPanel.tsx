import { Link } from 'react-router-dom'
import { DEFAULT_ROTATION_SIM_DURATION_SEC } from '../../lib/dpsSim'
import {
  formatTierStatus,
  labHrefForTierEntry,
  type TierListUpdateSummary,
  type TierListUpdateSummaryTabKey,
} from './tierListModel'

type SummarySection = {
  id: TierListUpdateSummaryTabKey
  label: string
  shortLabel: string
  count: number
}

type Props = {
  updateSummary: TierListUpdateSummary
  updatePanelMinimized: boolean
  toggleUpdatePanelMinimized: () => void
  onDismiss: () => void
  updateSummarySections: SummarySection[]
  effectiveUpdateSummaryTab: TierListUpdateSummaryTabKey
  setUpdateSummaryTab: (id: TierListUpdateSummaryTabKey) => void
}

export function TierListUpdateSummaryPanel({
  updateSummary,
  updatePanelMinimized,
  toggleUpdatePanelMinimized,
  onDismiss,
  updateSummarySections,
  effectiveUpdateSummaryTab,
  setUpdateSummaryTab,
}: Props) {
  return (
    <section className="lab-result tier-update-summary" aria-label="Last tier list update summary">
      <div className="tier-update-summary-head">
        <div className="tier-update-summary-head-text">
          <h3>Last update</h3>
          {!updatePanelMinimized && (
            <p className="muted tier-update-summary-meta">
              {new Date(updateSummary.finishedAt).toLocaleString()}
              {' · '}
              {updateSummary.mode === 'force' ? 'Full refresh' : 'Legacy incremental'}
              {' · '}
              {updateSummary.refreshedCount} Digimon refreshed
            </p>
          )}
        </div>
        <div className="tier-update-summary-actions">
          <button
            type="button"
            className="tier-update-summary-btn"
            onClick={toggleUpdatePanelMinimized}
            aria-expanded={!updatePanelMinimized}
          >
            {updatePanelMinimized ? 'Expand' : 'Minimize'}
          </button>
          <button
            type="button"
            className="tier-update-summary-btn tier-update-summary-btn-dismiss"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        </div>
      </div>
      {updatePanelMinimized ? (
        <div className="tier-update-summary-collapsed">
          <p className="tier-update-summary-collapsed-time muted">
            {new Date(updateSummary.finishedAt).toLocaleString()}
          </p>
          <div className="tier-update-summary-stat-chips" role="list" aria-label="Score changes by type">
            <span className="tier-update-summary-stat-chip" role="listitem">
              DPS
              <span className="tier-update-summary-stat-chip-delta" aria-label="DPS up, down, new">
                {updateSummary.dpsUp.length}↑ {updateSummary.dpsDown.length}↓ · {updateSummary.dpsNew.length}{' '}
                new
              </span>
            </span>
            <span className="tier-update-summary-stat-chip" role="listitem">
              Tank
              <span className="tier-update-summary-stat-chip-delta" aria-label="Tank up, down, new">
                {updateSummary.tankUp.length}↑ {updateSummary.tankDown.length}↓ · {updateSummary.tankNew.length}{' '}
                new
              </span>
            </span>
            <span className="tier-update-summary-stat-chip" role="listitem">
              Healer
              <span className="tier-update-summary-stat-chip-delta" aria-label="Healer up, down, new">
                {updateSummary.healerUp.length}↑ {updateSummary.healerDown.length}↓ ·{' '}
                {updateSummary.healerNew.length} new
              </span>
            </span>
            {updateSummary.statusChanges.length > 0 ? (
              <span className="tier-update-summary-stat-chip" role="listitem">
                Status
                <span className="tier-update-summary-stat-chip-delta">
                  {updateSummary.statusChanges.length} change
                  {updateSummary.statusChanges.length === 1 ? '' : 's'}
                </span>
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="tier-update-summary-body">
          {updateSummary.dpsUp.length === 0 &&
          updateSummary.dpsDown.length === 0 &&
          updateSummary.dpsNew.length === 0 &&
          updateSummary.tankUp.length === 0 &&
          updateSummary.tankDown.length === 0 &&
          updateSummary.tankNew.length === 0 &&
          updateSummary.healerUp.length === 0 &&
          updateSummary.healerDown.length === 0 &&
          updateSummary.healerNew.length === 0 &&
          updateSummary.statusChanges.length === 0 ? (
            <p className="muted">
              No DPS, tank, or healer score shifts above thresholds and no content status changes among
              refreshed Digimon.
            </p>
          ) : (
            <>
              {updateSummarySections.length > 1 ? (
                <div
                  className="tier-update-summary-tabs"
                  role="tablist"
                  aria-label="Update breakdown by score type"
                >
                  {updateSummarySections.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      role="tab"
                      aria-selected={effectiveUpdateSummaryTab === s.id}
                      aria-controls="tier-update-summary-panel"
                      id={`tier-update-tab-${s.id}`}
                      className="tier-update-summary-tab"
                      onClick={() => setUpdateSummaryTab(s.id)}
                    >
                      <span className="tier-update-summary-tab-label">{s.shortLabel}</span>
                      <span className="tier-update-summary-tab-badge">{s.count}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              <div
                className="tier-update-summary-tab-panel tier-update-summary-tab-panel-scroll"
                role="tabpanel"
                id="tier-update-summary-panel"
                aria-labelledby={
                  updateSummarySections.length > 1
                    ? `tier-update-tab-${effectiveUpdateSummaryTab}`
                    : undefined
                }
              >
                {effectiveUpdateSummaryTab === 'dps' && (
                  <div className="tier-update-summary-block">
                    <h4 className="tier-update-summary-subhead">
                      DPS ({DEFAULT_ROTATION_SIM_DURATION_SEC}s sustained)
                    </h4>
                    {updateSummary.dpsUp.length > 0 && (
                      <div className="tier-update-summary-subblock">
                        <p className="tier-update-summary-label">Increased</p>
                        <table className="tier-update-summary-table">
                          <thead>
                            <tr>
                              <th>Digimon</th>
                              <th>Role</th>
                              <th>Before</th>
                              <th>After</th>
                              <th>Δ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {updateSummary.dpsUp.map((r) => (
                              <tr key={`up-${r.id}`}>
                                <td>
                                  <Link to={labHrefForTierEntry(r.id)}>{r.name}</Link>
                                </td>
                                <td>{r.role}</td>
                                <td>{r.before.toFixed(1)}</td>
                                <td>{r.after.toFixed(1)}</td>
                                <td className="tier-update-summary-delta-pos">+{r.delta.toFixed(1)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {updateSummary.dpsDown.length > 0 && (
                      <div className="tier-update-summary-subblock">
                        <p className="tier-update-summary-label">Decreased</p>
                        <table className="tier-update-summary-table">
                          <thead>
                            <tr>
                              <th>Digimon</th>
                              <th>Role</th>
                              <th>Before</th>
                              <th>After</th>
                              <th>Δ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {updateSummary.dpsDown.map((r) => (
                              <tr key={`dn-${r.id}`}>
                                <td>
                                  <Link to={labHrefForTierEntry(r.id)}>{r.name}</Link>
                                </td>
                                <td>{r.role}</td>
                                <td>{r.before.toFixed(1)}</td>
                                <td>{r.after.toFixed(1)}</td>
                                <td className="tier-update-summary-delta-neg">{r.delta.toFixed(1)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {updateSummary.dpsNew.length > 0 && (
                      <div className="tier-update-summary-subblock">
                        <p className="tier-update-summary-label">Newly calculated</p>
                        <table className="tier-update-summary-table">
                          <thead>
                            <tr>
                              <th>Digimon</th>
                              <th>Role</th>
                              <th>DPS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {updateSummary.dpsNew.map((r) => (
                              <tr key={`nw-${r.id}`}>
                                <td>
                                  <Link to={labHrefForTierEntry(r.id)}>{r.name}</Link>
                                </td>
                                <td>{r.role}</td>
                                <td>{r.after.toFixed(1)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {effectiveUpdateSummaryTab === 'tank' && (
                  <div className="tier-update-summary-block">
                    <h4 className="tier-update-summary-subhead">Tank score (heuristic)</h4>
                    {updateSummary.tankUp.length > 0 && (
                      <div className="tier-update-summary-subblock">
                        <p className="tier-update-summary-label">Increased</p>
                        <table className="tier-update-summary-table">
                          <thead>
                            <tr>
                              <th>Digimon</th>
                              <th>Role</th>
                              <th>Before</th>
                              <th>After</th>
                              <th>Δ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {updateSummary.tankUp.map((r) => (
                              <tr key={`tup-${r.id}`}>
                                <td>
                                  <Link to={labHrefForTierEntry(r.id)}>{r.name}</Link>
                                </td>
                                <td>{r.role}</td>
                                <td>{r.before.toFixed(2)}</td>
                                <td>{r.after.toFixed(2)}</td>
                                <td className="tier-update-summary-delta-pos">+{r.delta.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {updateSummary.tankDown.length > 0 && (
                      <div className="tier-update-summary-subblock">
                        <p className="tier-update-summary-label">Decreased</p>
                        <table className="tier-update-summary-table">
                          <thead>
                            <tr>
                              <th>Digimon</th>
                              <th>Role</th>
                              <th>Before</th>
                              <th>After</th>
                              <th>Δ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {updateSummary.tankDown.map((r) => (
                              <tr key={`tdn-${r.id}`}>
                                <td>
                                  <Link to={labHrefForTierEntry(r.id)}>{r.name}</Link>
                                </td>
                                <td>{r.role}</td>
                                <td>{r.before.toFixed(2)}</td>
                                <td>{r.after.toFixed(2)}</td>
                                <td className="tier-update-summary-delta-neg">{r.delta.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {updateSummary.tankNew.length > 0 && (
                      <div className="tier-update-summary-subblock">
                        <p className="tier-update-summary-label">Newly calculated</p>
                        <table className="tier-update-summary-table">
                          <thead>
                            <tr>
                              <th>Digimon</th>
                              <th>Role</th>
                              <th>Score</th>
                            </tr>
                          </thead>
                          <tbody>
                            {updateSummary.tankNew.map((r) => (
                              <tr key={`tnw-${r.id}`}>
                                <td>
                                  <Link to={labHrefForTierEntry(r.id)}>{r.name}</Link>
                                </td>
                                <td>{r.role}</td>
                                <td>{r.after.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {effectiveUpdateSummaryTab === 'healer' && (
                  <div className="tier-update-summary-block">
                    <h4 className="tier-update-summary-subhead">Healer score (Support role, heuristic)</h4>
                    {updateSummary.healerUp.length > 0 && (
                      <div className="tier-update-summary-subblock">
                        <p className="tier-update-summary-label">Increased</p>
                        <table className="tier-update-summary-table">
                          <thead>
                            <tr>
                              <th>Digimon</th>
                              <th>Role</th>
                              <th>Before</th>
                              <th>After</th>
                              <th>Δ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {updateSummary.healerUp.map((r) => (
                              <tr key={`hup-${r.id}`}>
                                <td>
                                  <Link to={labHrefForTierEntry(r.id)}>{r.name}</Link>
                                </td>
                                <td>{r.role}</td>
                                <td>{r.before.toFixed(2)}</td>
                                <td>{r.after.toFixed(2)}</td>
                                <td className="tier-update-summary-delta-pos">+{r.delta.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {updateSummary.healerDown.length > 0 && (
                      <div className="tier-update-summary-subblock">
                        <p className="tier-update-summary-label">Decreased</p>
                        <table className="tier-update-summary-table">
                          <thead>
                            <tr>
                              <th>Digimon</th>
                              <th>Role</th>
                              <th>Before</th>
                              <th>After</th>
                              <th>Δ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {updateSummary.healerDown.map((r) => (
                              <tr key={`hdn-${r.id}`}>
                                <td>
                                  <Link to={labHrefForTierEntry(r.id)}>{r.name}</Link>
                                </td>
                                <td>{r.role}</td>
                                <td>{r.before.toFixed(2)}</td>
                                <td>{r.after.toFixed(2)}</td>
                                <td className="tier-update-summary-delta-neg">{r.delta.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {updateSummary.healerNew.length > 0 && (
                      <div className="tier-update-summary-subblock">
                        <p className="tier-update-summary-label">Newly calculated</p>
                        <table className="tier-update-summary-table">
                          <thead>
                            <tr>
                              <th>Digimon</th>
                              <th>Role</th>
                              <th>Score</th>
                            </tr>
                          </thead>
                          <tbody>
                            {updateSummary.healerNew.map((r) => (
                              <tr key={`hnw-${r.id}`}>
                                <td>
                                  <Link to={labHrefForTierEntry(r.id)}>{r.name}</Link>
                                </td>
                                <td>{r.role}</td>
                                <td>{r.after.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {effectiveUpdateSummaryTab === 'status' && (
                  <div className="tier-update-summary-block">
                    <h4 className="tier-update-summary-subhead">Content status</h4>
                    <table className="tier-update-summary-table">
                      <thead>
                        <tr>
                          <th>Digimon</th>
                          <th>Role</th>
                          <th>Was</th>
                          <th>Now</th>
                        </tr>
                      </thead>
                      <tbody>
                        {updateSummary.statusChanges.map((r) => (
                          <tr key={`st-${r.id}`}>
                            <td>
                              <Link to={labHrefForTierEntry(r.id)}>{r.name}</Link>
                            </td>
                            <td>{r.role}</td>
                            <td>{formatTierStatus(r.from)}</td>
                            <td>{formatTierStatus(r.to)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}
