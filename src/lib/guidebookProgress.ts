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
