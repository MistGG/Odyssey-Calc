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

function buildSampleDigimon(summary, priorCache, newCache, apiDiffs, limit = 12) {
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

  for (const row of apiDiffs ?? []) {
    push(row.id, 'api')
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

/** Mirrors TierListPage diffTierApiSnapshot — field-level wiki API diffs. */
function diffTierApiSnapshot(prev, next) {
  if (!prev || !next) return []
  const lines = []
  const push = (line) => {
    if (lines.length < 20) lines.push(line)
  }
  const normText = (v) => (v ?? '').replace(/\s+/g, ' ').trim()
  const cmpNum = (label, a, b) => {
    if (a !== b) push(`${label}: ${a} -> ${b}`)
  }
  const cmpText = (label, a, b) => {
    if (normText(a) !== normText(b)) push(`${label}: "${normText(a)}" -> "${normText(b)}"`)
  }

  cmpText('Role', prev.role, next.role)
  cmpText('Attribute', prev.attribute, next.attribute)
  cmpText('Element', prev.element, next.element)
  cmpNum('Rank', prev.rank, next.rank)
  cmpNum('HP', prev.hp, next.hp)
  cmpNum('Attack', prev.attack, next.attack)
  for (const key of Object.keys(prev.stats ?? {})) {
    if (key === 'hp' || key === 'attack') continue
    cmpNum(`Stats.${key}`, prev.stats[key], next.stats[key])
  }

  const prevSkills = new Map((prev.skills ?? []).map((s) => [s.id, s]))
  const nextSkills = new Map((next.skills ?? []).map((s) => [s.id, s]))
  for (const [id, ns] of nextSkills.entries()) {
    const ps = prevSkills.get(id)
    if (!ps) {
      push(`Skill added: ${ns.name}`)
      continue
    }
    cmpText(`Skill ${ns.name} name`, ps.name, ns.name)
    cmpNum(`Skill ${ns.name} base_dmg`, ps.base_dmg, ns.base_dmg)
    cmpNum(`Skill ${ns.name} scaling`, ps.scaling, ns.scaling)
    cmpNum(`Skill ${ns.name} cast_time`, ps.cast_time_sec, ns.cast_time_sec)
    cmpNum(`Skill ${ns.name} cooldown`, ps.cooldown_sec, ns.cooldown_sec)
    cmpNum(`Skill ${ns.name} ds_cost`, ps.ds_cost, ns.ds_cost)
    cmpNum(`Skill ${ns.name} radius`, ps.radius ?? 0, ns.radius ?? 0)
    cmpText(`Skill ${ns.name} description`, ps.description, ns.description)
    cmpText(`Skill ${ns.name} buff name`, ps.buff_name, ns.buff_name)
    cmpText(`Skill ${ns.name} buff description`, ps.buff_description, ns.buff_description)
    cmpNum(`Skill ${ns.name} buff duration`, ps.buff_duration ?? 0, ns.buff_duration ?? 0)
  }
  for (const [id, ps] of prevSkills.entries()) {
    if (!nextSkills.has(id)) push(`Skill removed: ${ps.name}`)
  }
  return lines
}

function buildApiDiffsFromCaches(priorCache, newCache, maxBuckets = 60) {
  const apiDiffById = {}
  const apiDiffs = []
  for (const id of Object.keys(newCache?.entries ?? {})) {
    const prevSnap = priorCache?.entries?.[id]?.apiSnapshot
    const nextSnap = newCache.entries[id]?.apiSnapshot
    if (!nextSnap) continue
    const lines = diffTierApiSnapshot(prevSnap, nextSnap)
    if (lines.length === 0) continue
    const clipped = lines.slice(0, 8)
    apiDiffById[id] = clipped
    apiDiffs.push({
      id,
      name: newCache.entries[id]?.name ?? id,
      lines: clipped,
    })
    if (apiDiffs.length >= maxBuckets) break
  }
  return { apiDiffById, apiDiffs }
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
  const { apiDiffById, apiDiffs } = buildApiDiffsFromCaches(priorCache, newCache)
  const apiCount = Math.max(apiDiffs.length, countApiSignatureChanges(priorCache, newCache))
  const tierCount = countTierChangesInSummary(summary)
  const sampleDigimon = buildSampleDigimon(summary, priorCache, newCache, apiDiffs)

  return {
    id: `${summary.finishedAt}-${Math.random().toString(36).slice(2, 8)}`,
    finishedAt: summary.finishedAt,
    mode,
    refreshedCount: refreshedIds.size,
    apiCount,
    tierCount,
    sampleDigimon,
    apiDiffById,
    apiDiffs,
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
