import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  loadTierChangeHistory,
  type TierChangeCause,
  type TierListChangeHistoryRow,
} from './tierList/tierListModel'

function causeLabel(cause: TierChangeCause): string {
  if (cause === 'api') return 'API data'
  return 'Tier'
}

type DigimonFeedRow = {
  key: string
  id: string
  name: string
  role: string
  cause: TierChangeCause
  lines: string[]
}

function addLine(
  map: Map<string, DigimonFeedRow>,
  meta: { id: string; name: string; role: string; cause: TierChangeCause },
  line: string,
) {
  const key = `${meta.id}:${meta.cause}`
  const prev = map.get(key)
  if (prev) {
    prev.lines.push(line)
    return
  }
  map.set(key, { key, ...meta, lines: [line] })
}

function buildDigimonFeed(row: TierListChangeHistoryRow): DigimonFeedRow[] {
  const nameById = new Map(row.sampleDigimon.map((d) => [d.id, d.name] as const))
  for (const r of row.summary.dpsUp) nameById.set(r.id, r.name)
  for (const r of row.summary.dpsDown) nameById.set(r.id, r.name)
  for (const r of row.summary.dpsNew) nameById.set(r.id, r.name)
  for (const r of row.summary.tankUp) nameById.set(r.id, r.name)
  for (const r of row.summary.tankDown) nameById.set(r.id, r.name)
  for (const r of row.summary.tankNew) nameById.set(r.id, r.name)
  for (const r of row.summary.healerUp) nameById.set(r.id, r.name)
  for (const r of row.summary.healerDown) nameById.set(r.id, r.name)
  for (const r of row.summary.healerNew) nameById.set(r.id, r.name)
  for (const r of row.summary.statusChanges) nameById.set(r.id, r.name)
  const map = new Map<string, DigimonFeedRow>()

  for (const r of row.summary.dpsUp) {
    addLine(
      map,
      { id: r.id, name: r.name, role: r.role, cause: 'tier' },
      `DPS ${r.before.toFixed(1)} -> ${r.after.toFixed(1)} (+${r.delta.toFixed(1)})`,
    )
  }
  for (const r of row.summary.dpsDown) {
    addLine(
      map,
      { id: r.id, name: r.name, role: r.role, cause: 'tier' },
      `DPS ${r.before.toFixed(1)} -> ${r.after.toFixed(1)} (${r.delta.toFixed(1)})`,
    )
  }
  for (const r of row.summary.dpsNew) {
    addLine(
      map,
      { id: r.id, name: r.name, role: r.role, cause: 'tier' },
      `DPS newly cached at ${r.after.toFixed(1)}`,
    )
  }

  for (const r of row.summary.tankUp) {
    addLine(
      map,
      { id: r.id, name: r.name, role: r.role, cause: 'tier' },
      `Tank ${r.before.toFixed(2)} -> ${r.after.toFixed(2)} (+${r.delta.toFixed(2)})`,
    )
  }
  for (const r of row.summary.tankDown) {
    addLine(
      map,
      { id: r.id, name: r.name, role: r.role, cause: 'tier' },
      `Tank ${r.before.toFixed(2)} -> ${r.after.toFixed(2)} (${r.delta.toFixed(2)})`,
    )
  }
  for (const r of row.summary.tankNew) {
    addLine(
      map,
      { id: r.id, name: r.name, role: r.role, cause: 'tier' },
      `Tank newly cached at ${r.after.toFixed(2)}`,
    )
  }

  for (const r of row.summary.healerUp) {
    addLine(
      map,
      { id: r.id, name: r.name, role: r.role, cause: 'tier' },
      `Healer ${r.before.toFixed(2)} -> ${r.after.toFixed(2)} (+${r.delta.toFixed(2)})`,
    )
  }
  for (const r of row.summary.healerDown) {
    addLine(
      map,
      { id: r.id, name: r.name, role: r.role, cause: 'tier' },
      `Healer ${r.before.toFixed(2)} -> ${r.after.toFixed(2)} (${r.delta.toFixed(2)})`,
    )
  }
  for (const r of row.summary.healerNew) {
    addLine(
      map,
      { id: r.id, name: r.name, role: r.role, cause: 'tier' },
      `Healer newly cached at ${r.after.toFixed(2)}`,
    )
  }

  for (const r of row.summary.statusChanges) {
    addLine(
      map,
      { id: r.id, name: r.name, role: r.role, cause: 'tier' },
      `Status ${String(r.from ?? 'pending')} -> ${r.to}`,
    )
  }

  for (const [id, lines] of Object.entries(row.apiDiffById ?? {})) {
    for (const line of lines) {
      addLine(
        map,
        {
          id,
          name: nameById.get(id) ?? id,
          role: '—',
          cause: 'api',
        },
        line,
      )
    }
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function TierChangesPage() {
  const rows = useMemo(
    () =>
      loadTierChangeHistory().map((row) => ({
        row,
        feed: buildDigimonFeed(row),
      })),
    [],
  )

  return (
    <div className="lab tier-page">
      <div className="tier-page-head">
        <h1>Tier list changes</h1>
      </div>
      <section className="lab-result">
        <p className="tier-wip-note">This page is a WIP. Data is checked against your cache.</p>
        {rows.length === 0 ? (
          <p className="muted">
            No tier change history yet. Run <Link to="/tier-list">Update tier list</Link> to create an
            entry.
          </p>
        ) : (
          <div className="tier-changes-list">
            {rows.map(({ row, feed }) => (
              <article key={row.id} className="tier-changes-item tier-changes-run">
                <div className="tier-changes-item-head">
                  <h3>
                    {new Date(row.finishedAt).toLocaleString()} ·{' '}
                    {row.mode === 'force' ? 'Force check' : 'Incremental update'}
                  </h3>
                  <span className="tier-changes-total">{row.refreshedCount} refreshed</span>
                </div>
                <p className="muted tier-changes-cause-breakdown">
                  API data: {row.apiCount} · Tier: {row.tierCount}
                </p>
                {feed.length > 0 ? (
                  <div className="tier-changes-digimon-grid">
                    {feed.map((d) => (
                      <article key={`${row.id}-${d.key}`} className="tier-changes-digimon-card">
                        <div className="tier-changes-digimon-head">
                          <Link to={`/lab?digimonId=${encodeURIComponent(d.id)}`}>{d.name}</Link>
                          <span className="muted">{d.role}</span>
                          <span className={`tier-changes-cause tier-changes-cause-${d.cause}`}>
                            {causeLabel(d.cause)}
                          </span>
                        </div>
                        <ul className="tier-changes-detail-list">
                          {d.lines.map((line, idx) => (
                            <li key={`${row.id}-${d.id}-${idx}`}>{line}</li>
                          ))}
                        </ul>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No score/status deltas were recorded for this run.</p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
