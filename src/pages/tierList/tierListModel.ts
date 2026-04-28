import { fetchDigimonPage } from '../../api/digimonService'
import { contentStatusLabel, type DigimonContentStatus } from '../../lib/contentStatus'
import { DEFAULT_ROTATION_SIM_DURATION_SEC } from '../../lib/dpsSim'
import type { DpsTierCategoryKey, SustainedDpsEntry, TierListMode } from '../../lib/tierList'
import type { WikiDigimonListItem } from '../../types/wikiApi'

export const REQUEST_DELAY_MS = 700
/** Backoff after HTTP 429 (tier list detail fetches). No proactive batch pause. */
export const RATE_LIMIT_COOLDOWN_MS = 10_000

export const TIER_UPDATE_PANEL_MINIMIZED_KEY = 'odysseyCalc.tierUpdatePanel.minimized.v1'
export const TIER_UPDATE_SUMMARY_STORAGE_KEY = 'odysseyCalc.tierUpdateSummary.v1'
export const TIER_CHANGE_HISTORY_STORAGE_KEY = 'odysseyCalc.tierChangeHistory.v1'
export const TIER_LIST_MODE_KEY = 'odysseyCalc.tierList.mode.v1'
export const TIER_DPS_CATEGORY_KEY = 'odysseyCalc.tierList.dpsCategory.v1'
export const TIER_DPS_FORCE_AUTO_CRIT_KEY = 'odysseyCalc.tierList.dpsForceAutoCrit.v1'
export const TIER_DPS_PERFECT_AT_CLONE_KEY = 'odysseyCalc.tierList.dpsPerfectAtClone.v1'
export const TIER_DPS_AUTO_ANIM_CANCEL_KEY = 'odysseyCalc.tierList.dpsAutoAnimCancel.v1'
export const TIER_IGNORE_INCOMPLETE_KEY = 'odysseyCalc.tierList.ignoreIncomplete.v1'
export const TIER_DPS_CHANGE_EPS = 0.05
export const TIER_TANK_SCORE_CHANGE_EPS = 0.02
export const TIER_HEALER_SCORE_CHANGE_EPS = 0.02

export type TierListUpdateSummary = {
  finishedAt: string
  mode: 'incremental' | 'force'
  refreshedCount: number
  dpsUp: Array<{
    id: string
    name: string
    role: string
    before: number
    after: number
    delta: number
  }>
  dpsDown: Array<{
    id: string
    name: string
    role: string
    before: number
    after: number
    delta: number
  }>
  dpsNew: Array<{ id: string; name: string; role: string; after: number }>
  statusChanges: Array<{
    id: string
    name: string
    role: string
    from: DigimonContentStatus | undefined
    to: DigimonContentStatus
  }>
  tankUp: Array<{
    id: string
    name: string
    role: string
    before: number
    after: number
    delta: number
  }>
  tankDown: Array<{
    id: string
    name: string
    role: string
    before: number
    after: number
    delta: number
  }>
  tankNew: Array<{ id: string; name: string; role: string; after: number }>
  healerUp: Array<{
    id: string
    name: string
    role: string
    before: number
    after: number
    delta: number
  }>
  healerDown: Array<{
    id: string
    name: string
    role: string
    before: number
    after: number
    delta: number
  }>
  healerNew: Array<{ id: string; name: string; role: string; after: number }>
}

export type TierListUpdateSummaryTabKey = 'dps' | 'tank' | 'healer' | 'status'

export type TierChangeCause = 'api' | 'tier'

export type TierListChangeHistoryRow = {
  id: string
  finishedAt: string
  mode: 'incremental' | 'force'
  refreshedCount: number
  apiCount: number
  tierCount: number
  sampleDigimon: Array<{ id: string; name: string; cause: TierChangeCause }>
  /** API field-level diffs by Digimon id (e.g. skill cooldown/base/scaling/radius changes). */
  apiDiffById?: Record<string, string[]>
  summary: TierListUpdateSummary
}

export function readTierUpdatePanelMinimized(): boolean {
  try {
    return localStorage.getItem(TIER_UPDATE_PANEL_MINIMIZED_KEY) === '1'
  } catch {
    return false
  }
}

export function writeTierUpdatePanelMinimized(minimized: boolean) {
  try {
    localStorage.setItem(TIER_UPDATE_PANEL_MINIMIZED_KEY, minimized ? '1' : '0')
  } catch {
    /* ignore quota / private mode */
  }
}

export function readTierListMode(): TierListMode {
  try {
    const v = localStorage.getItem(TIER_LIST_MODE_KEY)
    if (v === 'tank') return 'tank'
    if (v === 'healer') return 'healer'
  } catch {
    /* ignore */
  }
  return 'dps'
}

export function writeTierListMode(mode: TierListMode) {
  try {
    localStorage.setItem(TIER_LIST_MODE_KEY, mode)
  } catch {
    /* ignore */
  }
}

export function readDpsTierCategory(): DpsTierCategoryKey {
  try {
    const v = localStorage.getItem(TIER_DPS_CATEGORY_KEY)
    if (v === 'sustained' || v === 'burst' || v === 'aoe') {
      return v
    }
    if (v === 'specialized') {
      return 'sustained'
    }
    if (
      v === 'aoe_general' ||
      v === 'aoe_damage' ||
      v === 'aoe_cooldown' ||
      v === 'aoe_farming' ||
      v === 'aoe_radius'
    ) {
      return 'aoe'
    }
  } catch {
    /* ignore */
  }
  return 'sustained'
}

export function writeDpsTierCategory(cat: DpsTierCategoryKey) {
  try {
    localStorage.setItem(TIER_DPS_CATEGORY_KEY, cat)
  } catch {
    /* ignore */
  }
}

export function readDpsForceAutoCrit(): boolean {
  try {
    return localStorage.getItem(TIER_DPS_FORCE_AUTO_CRIT_KEY) === '1'
  } catch {
    return false
  }
}

export function writeDpsForceAutoCrit(on: boolean) {
  try {
    localStorage.setItem(TIER_DPS_FORCE_AUTO_CRIT_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function readDpsPerfectAtClone(): boolean {
  try {
    return localStorage.getItem(TIER_DPS_PERFECT_AT_CLONE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeDpsPerfectAtClone(on: boolean) {
  try {
    localStorage.setItem(TIER_DPS_PERFECT_AT_CLONE_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function readDpsAutoAnimCancel(): boolean {
  try {
    return localStorage.getItem(TIER_DPS_AUTO_ANIM_CANCEL_KEY) === '1'
  } catch {
    return false
  }
}

export function writeDpsAutoAnimCancel(on: boolean) {
  try {
    localStorage.setItem(TIER_DPS_AUTO_ANIM_CANCEL_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function readTierIgnoreIncomplete(): boolean {
  try {
    return localStorage.getItem(TIER_IGNORE_INCOMPLETE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeTierIgnoreIncomplete(on: boolean) {
  try {
    localStorage.setItem(TIER_IGNORE_INCOMPLETE_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function isTierListUpdateSummary(v: unknown): v is TierListUpdateSummary {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o.finishedAt === 'string' &&
    (o.mode === 'incremental' || o.mode === 'force') &&
    typeof o.refreshedCount === 'number' &&
    Array.isArray(o.dpsUp) &&
    Array.isArray(o.dpsDown) &&
    Array.isArray(o.dpsNew) &&
    Array.isArray(o.statusChanges)
  )
}

function normalizeTierUpdateSummary(parsed: TierListUpdateSummary): TierListUpdateSummary {
  return {
    ...parsed,
    tankUp: Array.isArray(parsed.tankUp) ? parsed.tankUp : [],
    tankDown: Array.isArray(parsed.tankDown) ? parsed.tankDown : [],
    tankNew: Array.isArray(parsed.tankNew) ? parsed.tankNew : [],
    healerUp: Array.isArray(parsed.healerUp) ? parsed.healerUp : [],
    healerDown: Array.isArray(parsed.healerDown) ? parsed.healerDown : [],
    healerNew: Array.isArray(parsed.healerNew) ? parsed.healerNew : [],
  }
}

export function loadTierUpdateSummaryFromStorage(): TierListUpdateSummary | null {
  try {
    const raw = localStorage.getItem(TIER_UPDATE_SUMMARY_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isTierListUpdateSummary(parsed) ? normalizeTierUpdateSummary(parsed) : null
  } catch {
    return null
  }
}

export function saveTierUpdateSummaryToStorage(summary: TierListUpdateSummary | null) {
  try {
    if (!summary) {
      localStorage.removeItem(TIER_UPDATE_SUMMARY_STORAGE_KEY)
      return
    }
    localStorage.setItem(TIER_UPDATE_SUMMARY_STORAGE_KEY, JSON.stringify(summary))
  } catch {
    /* ignore */
  }
}

export function loadTierChangeHistory(): TierListChangeHistoryRow[] {
  try {
    const raw = localStorage.getItem(TIER_CHANGE_HISTORY_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const out: TierListChangeHistoryRow[] = []
    for (const row of parsed) {
      if (!row || typeof row !== 'object') continue
      const r = row as Record<string, unknown>
      const id = typeof r.id === 'string' ? r.id : null
      const finishedAt = typeof r.finishedAt === 'string' ? r.finishedAt : null
      const mode = r.mode === 'incremental' || r.mode === 'force' ? r.mode : null
      const refreshedCount = typeof r.refreshedCount === 'number' ? r.refreshedCount : null
      const apiCount = typeof r.apiCount === 'number' ? r.apiCount : 0
      const legacyFormula = typeof r.formulaCount === 'number' ? r.formulaCount : 0
      const legacyMixed = typeof r.mixedCount === 'number' ? r.mixedCount : 0
      const legacyOther = typeof r.otherCount === 'number' ? r.otherCount : 0
      const tierCount =
        typeof r.tierCount === 'number' ? r.tierCount : legacyFormula + legacyMixed + legacyOther
      const summaryUnknown = r.summary
      if (
        !id ||
        !finishedAt ||
        !mode ||
        refreshedCount == null ||
        !isTierListUpdateSummary(summaryUnknown)
      ) {
        continue
      }
      const summary = normalizeTierUpdateSummary(summaryUnknown)
      const rawSample = Array.isArray(r.sampleDigimon) ? r.sampleDigimon : []
      const rawApiDiffById =
        r.apiDiffById && typeof r.apiDiffById === 'object'
          ? (r.apiDiffById as Record<string, unknown>)
          : {}
      const apiDiffById: Record<string, string[]> = {}
      for (const [id, val] of Object.entries(rawApiDiffById)) {
        if (!Array.isArray(val)) continue
        const lines = val.filter((x): x is string => typeof x === 'string').slice(0, 20)
        if (lines.length > 0) apiDiffById[id] = lines
      }
      const sampleDigimon: TierListChangeHistoryRow['sampleDigimon'] = rawSample
        .filter(
          (d): d is { id: string; name: string; cause: TierChangeCause | 'formula' | 'mixed' | 'other' } =>
            !!d &&
            typeof d === 'object' &&
            typeof (d as { id?: unknown }).id === 'string' &&
            typeof (d as { name?: unknown }).name === 'string' &&
            ['api', 'tier', 'formula', 'mixed', 'other'].includes(
              String((d as { cause?: unknown }).cause),
            ),
        )
        .map((d) => ({
          id: d.id,
          name: d.name,
          cause: d.cause === 'api' ? ('api' as const) : ('tier' as const),
        }))
        .slice(0, 12)
      out.push({
        id,
        finishedAt,
        mode,
        refreshedCount,
        apiCount,
        tierCount,
        sampleDigimon,
        apiDiffById,
        summary,
      })
    }
    return out
  } catch {
    return []
  }
}

export function saveTierChangeHistory(rows: TierListChangeHistoryRow[]) {
  try {
    localStorage.setItem(TIER_CHANGE_HISTORY_STORAGE_KEY, JSON.stringify(rows))
  } catch {
    /* ignore */
  }
}

export function appendTierChangeHistory(row: TierListChangeHistoryRow, maxRows = 80) {
  const next = [row, ...loadTierChangeHistory()].slice(0, Math.max(1, maxRows))
  saveTierChangeHistory(next)
}

export function formatTierStatus(s: DigimonContentStatus | undefined) {
  if (!s) return 'Pending'
  return contentStatusLabel(s)
}

export function labHrefForTierEntry(id: string) {
  return `/lab?digimonId=${encodeURIComponent(id)}&duration=${DEFAULT_ROTATION_SIM_DURATION_SEC}`
}

export function buildTierListUpdateSummary(
  mode: 'incremental' | 'force',
  snapshotBefore: Record<
    string,
    { dps: number; tankScore?: number; healerScore?: number; status?: DigimonContentStatus }
  >,
  entriesAfter: Record<string, SustainedDpsEntry>,
  refreshedIds: Set<string>,
): TierListUpdateSummary {
  const dpsUp: TierListUpdateSummary['dpsUp'] = []
  const dpsDown: TierListUpdateSummary['dpsDown'] = []
  const dpsNew: TierListUpdateSummary['dpsNew'] = []
  const tankUp: TierListUpdateSummary['tankUp'] = []
  const tankDown: TierListUpdateSummary['tankDown'] = []
  const tankNew: TierListUpdateSummary['tankNew'] = []
  const healerUp: TierListUpdateSummary['healerUp'] = []
  const healerDown: TierListUpdateSummary['healerDown'] = []
  const healerNew: TierListUpdateSummary['healerNew'] = []
  const statusChanges: TierListUpdateSummary['statusChanges'] = []

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

  dpsUp.sort((a, b) => b.delta - a.delta)
  dpsDown.sort((a, b) => a.delta - b.delta)
  tankUp.sort((a, b) => b.delta - a.delta)
  tankDown.sort((a, b) => a.delta - b.delta)
  healerUp.sort((a, b) => b.delta - a.delta)
  healerDown.sort((a, b) => a.delta - b.delta)
  statusChanges.sort((a, b) => a.name.localeCompare(b.name))

  return {
    finishedAt: new Date().toISOString(),
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

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function listSignature(d: WikiDigimonListItem) {
  return [
    d.id,
    d.name,
    d.model_id,
    d.stage,
    d.attribute,
    d.element,
    d.role,
    d.rank,
    d.hp,
    d.attack,
    (d.family_types ?? []).join(','),
  ].join('|')
}

export async function fetchAllDigimonIndex() {
  const first = await fetchDigimonPage(0, 500)
  const all = [...first.data]
  for (let p = 2; p <= Math.max(1, first.total_pages || 1); p += 1) {
    const next = await fetchDigimonPage(p - 1, 500)
    all.push(...next.data)
  }
  const meta: Record<string, WikiDigimonListItem> = {}
  const signatures: Record<string, string> = {}
  all.forEach((d) => {
    meta[d.id] = d
    signatures[d.id] = listSignature(d)
  })
  return { all, meta, signatures }
}

export function levelMapForSkills(skills: { id: string; max_level: number }[]) {
  const map: Record<string, number> = {}
  for (const s of skills) map[s.id] = Math.max(1, Math.min(25, s.max_level || 25))
  return map
}
