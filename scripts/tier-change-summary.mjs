/** Mirrors src/pages/tierList/tierListModel.ts summary + history row builders for GHA worker. */

export const TIER_DPS_CHANGE_EPS = 0.05
export const TIER_TANK_SCORE_CHANGE_EPS = 0.02
export const TIER_HEALER_SCORE_CHANGE_EPS = 0.02

export function buildTierListUpdateSummary(
  mode,
  snapshotBefore,
  entriesAfter,
  refreshedIds,
) {
  const dpsUp = []
  const dpsDown = []
  const dpsNew = []
  const tankUp = []
  const tankDown = []
  const tankNew = []
  const healerUp = []
  const healerDown = []
  const healerNew = []
  const statusChanges = []

  for (const id of refreshedIds) {
    const after = entriesAfter[id]
    if (!after) continue
    const before = snapshotBefore[id]
    const roleTrim = (after.role || '').trim()
    if (before === undefined) {
      dpsNew.push({ id, name: after.name, role: after.role, after: after.dps })
      if (roleTrim === 'Tank') {
        tankNew.push({
          id,
          name: after.name,
          role: after.role,
          after: after.tankScore ?? 0,
        })
      }
      if (roleTrim === 'Support') {
        healerNew.push({
          id,
          name: after.name,
          role: after.role,
          after: after.healerScore ?? 0,
        })
      }
    } else {
      const delta = after.dps - before.dps
      if (delta > TIER_DPS_CHANGE_EPS) {
        dpsUp.push({
          id,
          name: after.name,
          role: after.role,
          before: before.dps,
          after: after.dps,
          delta,
        })
      } else if (delta < -TIER_DPS_CHANGE_EPS) {
        dpsDown.push({
          id,
          name: after.name,
          role: after.role,
          before: before.dps,
          after: after.dps,
          delta,
        })
      }

      if (roleTrim === 'Tank') {
        const ta = after.tankScore ?? 0
        const tb = before.tankScore ?? 0
        const tDelta = ta - tb
        if (tDelta > TIER_TANK_SCORE_CHANGE_EPS) {
          tankUp.push({
            id,
            name: after.name,
            role: after.role,
            before: tb,
            after: ta,
            delta: tDelta,
          })
        } else if (tDelta < -TIER_TANK_SCORE_CHANGE_EPS) {
          tankDown.push({
            id,
            name: after.name,
            role: after.role,
            before: tb,
            after: ta,
            delta: tDelta,
          })
        }
      }

      if (roleTrim === 'Support') {
        const ha = after.healerScore ?? 0
        const hb = before.healerScore ?? 0
        const hDelta = ha - hb
        if (hDelta > TIER_HEALER_SCORE_CHANGE_EPS) {
          healerUp.push({
            id,
            name: after.name,
            role: after.role,
            before: hb,
            after: ha,
            delta: hDelta,
          })
        } else if (hDelta < -TIER_HEALER_SCORE_CHANGE_EPS) {
          healerDown.push({
            id,
            name: after.name,
            role: after.role,
            before: hb,
            after: ha,
            delta: hDelta,
          })
        }
      }
    }
    const prevStatus = before?.status
    const nextStatus = after.status
    if (nextStatus !== undefined && prevStatus !== nextStatus) {
      statusChanges.push({
        id,
        name: after.name,
        role: after.role,
        from: prevStatus,
        to: nextStatus,
      })
    }
  }

  const finishedAt = new Date().toISOString()
  return {
    finishedAt,
    mode,
    refreshedCount: refreshedIds.size,
    dpsUp,
    dpsDown,
    dpsNew,
    tankUp,
    tankDown,
    tankNew,
    healerUp,
    healerDown,
    healerNew,
    statusChanges,
  }
}

function snapshotBeforeFromCache(priorCache) {
  const snapshotBefore = {}
  for (const [id, e] of Object.entries(priorCache?.entries ?? {})) {
    snapshotBefore[id] = {
      dps: e.dps,
      tankScore: e.tankScore,
      healerScore: e.healerScore,
      status: e.status,
    }
  }
  return snapshotBefore
}

function hadPriorSignatures(priorCache) {
  return Object.keys(priorCache?.listSignatures ?? {}).length > 0
}

function countTierChangesInSummary(summary) {
  const ids = new Set()
  for (const bucket of [
    summary.dpsUp,
    summary.dpsDown,
    summary.dpsNew,
    summary.tankUp,
    summary.tankDown,
    summary.tankNew,
    summary.healerUp,
    summary.healerDown,
    summary.healerNew,
    summary.statusChanges,
  ]) {
    for (const row of bucket) ids.add(row.id)
  }
  return ids.size
}

function buildSampleDigimon(summary, priorCache, newCache, limit = 12) {
  const sample = []
  const seen = new Set()
  const push = (id, cause) => {
    if (seen.has(id) || sample.length >= limit) return
    seen.add(id)
    const name = newCache.entries?.[id]?.name ?? priorCache?.entries?.[id]?.name ?? id
    sample.push({ id, name, cause })
  }

  for (const id of Object.keys(newCache?.listSignatures ?? {})) {
    if (
      hadPriorSignatures(priorCache) &&
      priorCache.listSignatures?.[id] !== newCache.listSignatures?.[id]
    ) {
      push(id, 'api')
    }
  }

  for (const bucket of [
    summary.dpsUp,
    summary.dpsDown,
    summary.dpsNew,
    summary.tankUp,
    summary.tankDown,
    summary.tankNew,
    summary.healerUp,
    summary.healerDown,
    summary.healerNew,
    summary.statusChanges,
  ]) {
    for (const row of bucket) push(row.id, 'tier')
  }

  return sample
}

function countApiSignatureChanges(priorCache, newCache) {
  if (!hadPriorSignatures(priorCache)) return 0
  let n = 0
  for (const id of Object.keys(newCache?.listSignatures ?? {})) {
    if (priorCache.listSignatures?.[id] !== newCache.listSignatures?.[id]) n += 1
  }
  return n
}

/**
 * Build a published history run by diffing the prior committed snapshot vs the new cache.
 * The in-browser force refresh compares against the same published snapshot (already loaded),
 * so its summary is often empty — GHA must diff on disk instead.
 */
export function buildTierChangeHistoryRun(priorCache, newCache, mode = 'force') {
  const snapshotBefore = snapshotBeforeFromCache(priorCache)
  const refreshedIds = new Set(Object.keys(newCache?.entries ?? {}))
  const summary = buildTierListUpdateSummary(mode, snapshotBefore, newCache.entries ?? {}, refreshedIds)
  const apiCount = countApiSignatureChanges(priorCache, newCache)
  const tierCount = countTierChangesInSummary(summary)
  const sampleDigimon = buildSampleDigimon(summary, priorCache, newCache)

  return {
    id: `${summary.finishedAt}-${Math.random().toString(36).slice(2, 8)}`,
    finishedAt: summary.finishedAt,
    mode,
    refreshedCount: refreshedIds.size,
    apiCount,
    tierCount,
    sampleDigimon,
    apiDiffById: {},
    apiDiffs: [],
    summary,
  }
}

export function mergeTierChangeHistoryRuns(newRun, priorRuns, maxRows = 120) {
  const out = [newRun]
  for (const row of priorRuns ?? []) {
    if (!row || typeof row !== 'object') continue
    if (row.id === newRun.id) continue
    if (row.finishedAt === newRun.finishedAt) continue
    out.push(row)
    if (out.length >= maxRows) break
  }
  return out
}
