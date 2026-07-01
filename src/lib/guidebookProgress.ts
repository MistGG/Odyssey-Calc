import {
  guidebookDefaultProgressStepId,
  guidebookNormalizeProgressStepId,
  guidebookProgressEligibleStepIds,
} from './guidebookProgression'

export const GUIDEBOOK_PROGRESS_STORAGE_KEY = 'odysseyCalc.guidebook.progress.v2'

const PROGRESS_STEP_IDS = new Set(guidebookProgressEligibleStepIds())

export function readGuidebookProgressStep(): string {
  try {
    const raw = localStorage.getItem(GUIDEBOOK_PROGRESS_STORAGE_KEY)?.trim()
    if (raw) return guidebookNormalizeProgressStepId(raw)
  } catch {
    /* ignore */
  }
  return guidebookDefaultProgressStepId()
}

export function writeGuidebookProgressStep(stepId: string) {
  if (!PROGRESS_STEP_IDS.has(stepId)) return
  try {
    localStorage.setItem(GUIDEBOOK_PROGRESS_STORAGE_KEY, stepId)
  } catch {
    /* ignore quota */
  }
}

export const GUIDEBOOK_COLLAPSED_CLUSTERS_STORAGE_KEY = 'odysseyCalc.guidebook.collapsedClusters.v2'

const COLLAPSIBLE_TRAIL_CLUSTERS = new Set(['gear', 'corrupted-gear', 'dark-gear'])

export type GuidebookCollapsibleTrailCluster = 'gear' | 'corrupted-gear' | 'dark-gear'

const GUIDEBOOK_DEFAULT_COLLAPSED_CLUSTERS: ReadonlySet<GuidebookCollapsibleTrailCluster> = new Set([
  'gear',
  'corrupted-gear',
  'dark-gear',
])

export function readGuidebookCollapsedClusters(): ReadonlySet<GuidebookCollapsibleTrailCluster> {
  try {
    const raw = localStorage.getItem(GUIDEBOOK_COLLAPSED_CLUSTERS_STORAGE_KEY)
    if (!raw) return new Set(GUIDEBOOK_DEFAULT_COLLAPSED_CLUSTERS)
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set(GUIDEBOOK_DEFAULT_COLLAPSED_CLUSTERS)
    return new Set(
      parsed.filter(
        (cluster): cluster is GuidebookCollapsibleTrailCluster =>
          typeof cluster === 'string' && COLLAPSIBLE_TRAIL_CLUSTERS.has(cluster),
      ),
    )
  } catch {
    return new Set(GUIDEBOOK_DEFAULT_COLLAPSED_CLUSTERS)
  }
}

export function writeGuidebookCollapsedClusters(
  collapsed: ReadonlySet<GuidebookCollapsibleTrailCluster>,
) {
  try {
    localStorage.setItem(GUIDEBOOK_COLLAPSED_CLUSTERS_STORAGE_KEY, JSON.stringify([...collapsed]))
  } catch {
    /* ignore quota */
  }
}
