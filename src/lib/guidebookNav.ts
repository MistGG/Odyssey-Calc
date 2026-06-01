import { guidebookProgressionStep, guidebookProgressionStepIds } from './guidebookProgression'
import { guidebookSectionUrl } from './guidebookShare'

export { guidebookSectionUrl } from './guidebookShare'

const VALID_STEP_IDS = new Set(guidebookProgressionStepIds())

export function guidebookStepTitle(stepId: string): string | null {
  return guidebookProgressionStep(stepId)?.title ?? null
}

export function guidebookStepPath(stepId: string): string {
  return `/guidebook?step=${encodeURIComponent(stepId)}`
}

/** @deprecated Use {@link guidebookStepPath}. */
export function guidebookSectionPath(sectionId: string): string {
  return guidebookStepPath(sectionId)
}

/** @deprecated Use {@link guidebookStepTitle}. */
export function guidebookSectionTitle(sectionId: string): string | null {
  return guidebookStepTitle(sectionId)
}

export async function copyGuidebookStepLink(stepId: string): Promise<boolean> {
  if (!VALID_STEP_IDS.has(stepId)) return false
  try {
    await navigator.clipboard.writeText(guidebookSectionUrl(stepId))
    return true
  } catch {
    return false
  }
}

/** @deprecated Use {@link copyGuidebookStepLink}. */
export async function copyGuidebookSectionLink(sectionId: string): Promise<boolean> {
  return copyGuidebookStepLink(sectionId)
}
