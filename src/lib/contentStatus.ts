import type { WikiSkill } from '../types/wikiApi'

export type DigimonContentStatus = 'complete' | 'incomplete'

export function getDigimonContentStatus(skills: WikiSkill[] | undefined): DigimonContentStatus {
  const list = skills ?? []
  if (list.length < 5) return 'incomplete'
  const hasPlaceholder = list.some((s) => /placeholder/i.test(s.name ?? ''))
  return hasPlaceholder ? 'incomplete' : 'complete'
}

export function contentStatusLabel(status: DigimonContentStatus) {
  return status === 'incomplete' ? 'Incomplete' : 'Complete (can change)'
}
