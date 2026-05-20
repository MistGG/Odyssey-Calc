export const METER_AUTO_ATTACK_LABEL = 'Auto Attack'

/** Canonical skill bucket key for meter breakdown rows (EventStream / companion). */
export const METER_BASIC_ATTACK_SKILL_KEY = '(basic)'

export function isMeterBasicAttackSkillKey(skillKey: string | undefined | null): boolean {
  const k = String(skillKey ?? '').trim().toLowerCase()
  return k === METER_BASIC_ATTACK_SKILL_KEY || k === 'basic'
}

export function isMeterAutoAttackSkillName(skillName: string | undefined | null): boolean {
  return String(skillName ?? '').trim().toLowerCase() === METER_AUTO_ATTACK_LABEL.toLowerCase()
}

export function isMeterAutoAttackSkill(skill: {
  skill?: string
  skillKey?: string
}): boolean {
  return (
    isMeterAutoAttackSkillName(skill.skill) ||
    isMeterBasicAttackSkillKey(skill.skillKey)
  )
}

/** Same `public/meter/auto_attack.png` asset as Odyssey Companion (`src/assets/auto_attack.png`). */
export function meterAutoAttackIconUrl(): string {
  const base = import.meta.env.BASE_URL || '/'
  return `${base.endsWith('/') ? base : `${base}/`}meter/auto_attack.png`
}

/** Companion may persist a dev-only Vite URL; treat those as missing on the website. */
export function isCompanionOnlyAutoAttackIconUrl(url: string): boolean {
  const u = url.trim().toLowerCase()
  if (!u) return false
  if (u.includes('auto_attack') && (u.includes('/assets/') || u.includes('localhost') || u.startsWith('file:'))) {
    return true
  }
  return false
}
