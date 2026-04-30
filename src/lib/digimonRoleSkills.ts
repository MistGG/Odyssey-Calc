import type { WikiSkill } from '../types/wikiApi'

/**
 * In-game **Digimon role** passives (by wiki `role`: Melee DPS, Ranged DPS, etc.).
 * These are not tamer skills; tamer-side passives may be added later.
 */
/** Role buff skills are instant cast in current game (good for auto-animation cancels). */
export const DIGIMON_ROLE_SKILL_CAST_SEC = 0

export const HYBRID_STANCE_IDS = {
  melee: 'digimon-role-hybrid-melee-stance',
  ranged: 'digimon-role-hybrid-ranged-stance',
  caster: 'digimon-role-hybrid-caster-stance',
} as const

export type HybridStance = keyof typeof HYBRID_STANCE_IDS

/** Normalize wiki `role` for comparisons (trim, lower case, collapse spaces). */
export function normalizeWikiRole(role: string | null | undefined): string {
  return (role ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function roleSkill(
  id: string,
  name: string,
  cooldownSec: number,
  buffDurationSec: number,
  description: string,
): WikiSkill {
  return {
    id,
    name,
    description,
    element: '',
    icon_id: '',
    base_dmg: 0,
    scaling: 0,
    max_level: 25,
    cast_time_sec: DIGIMON_ROLE_SKILL_CAST_SEC,
    cooldown_sec: cooldownSec,
    ds_cost: 0,
    buff: {
      id: `${id}-buff`,
      name,
      description: '',
      duration: buffDurationSec,
      is_debuff: false,
    },
  }
}

/**
 * Extra support-only skills tied to the Digimon's wiki role (Lab / tier DPS sim).
 * Hybrid returns exactly one stance line; mutual exclusion is handled in the sim.
 *
 * Note: Intelligence buffs are listed where they exist in-game but are not applied
 * to DPS (INT also affects cooldown in-game; that is not modeled).
 */
export function digimonRoleWikiSkills(roleNorm: string, hybridStance: HybridStance): WikiSkill[] {
  switch (roleNorm) {
    case 'melee dps':
      return [
        roleSkill(
          'digimon-role-melee-berserker-soul',
          'Berserker Soul',
          60,
          15,
          'Increases Attack Speed by 12%. Increases Attack Power by 20%. Increases Critical Damage by 20%.',
        ),
        roleSkill(
          'digimon-role-melee-inner-energy',
          'Inner Energy',
          45,
          1,
          'Heals 20% HP.',
        ),
        roleSkill(
          'digimon-role-melee-sprint',
          'Sprint',
          30,
          9,
          'Increases Movement Speed by 30%.',
        ),
        roleSkill(
          'digimon-role-melee-ultimate-instinct',
          'Ultimate Instinct',
          90,
          5,
          'Increases Evasion by 200%.',
        ),
        roleSkill(
          'digimon-role-melee-digital-hazard',
          'Digital Hazard',
          90,
          15,
          'Increases Attack Speed by 15%. Increases Attack Power by 30%. Increases Critical Damage by 50%.',
        ),
      ]
    case 'ranged dps':
      return [
        roleSkill(
          'digimon-role-ranged-quick-shot',
          'Quick Shot',
          60,
          15,
          'Increases Attack Speed by 20%. Increases Attack Power by 15%. Increases Critical Damage by 10%.',
        ),
        roleSkill(
          'digimon-role-ranged-hawk-eye',
          'Hawk Eye',
          60,
          20,
          'Increases Critical Rate by 20%.',
        ),
        roleSkill(
          'digimon-role-ranged-sprint',
          'Sprint',
          30,
          9,
          'Increases Movement Speed by 30%.',
        ),
        roleSkill(
          'digimon-role-ranged-ultimate-accuracy',
          'Ultimate Accuracy',
          30,
          10,
          'Increases Hit Rate by 50%.',
        ),
        roleSkill(
          'digimon-role-ranged-hyper-focus',
          'Hyper Focus',
          90,
          15,
          'Increases Attack Speed by 25%. Increases Critical Damage by 25%. Increases Critical Rate by 30%.',
        ),
      ]
    case 'caster':
      return [
        roleSkill(
          'digimon-role-caster-ravage',
          'Magia Code: Ravage',
          35,
          10,
          'Increases Skill Damage by 100%.',
        ),
        roleSkill(
          'digimon-role-caster-dispell',
          'Magia Code: Dispell',
          5,
          1,
          'Removes all debuffs.',
        ),
        roleSkill(
          'digimon-role-caster-spring',
          'Spring',
          30,
          9,
          'Increases Movement Speed by 30%.',
        ),
        roleSkill(
          'digimon-role-caster-protection',
          'Magia Code: Protection',
          35,
          5,
          'Reduces all damage taken by 99%.',
        ),
        roleSkill(
          'digimon-role-caster-omega',
          'Magia Code: Omega',
          35,
          30,
          'Increases Intelligence by 150%. Reduces all skill cooldowns. Intelligence and cooldown reduction are not modeled in this sim; kept for animation-cancel timing.',
        ),
      ]
    case 'hybrid':
      if (hybridStance === 'melee') {
        return [
          roleSkill(
            HYBRID_STANCE_IDS.melee,
            'Melee Stance',
            10,
            600,
            'Increases Attack Speed by 8%. Increases Attack by 15%. Increases Critical Damage by 10%.',
          ),
        ]
      }
      if (hybridStance === 'ranged') {
        return [
          roleSkill(
            HYBRID_STANCE_IDS.ranged,
            'Ranged Stance',
            10,
            600,
            'Increases Attack Speed by 12%. Increases Attack by 8%.',
          ),
        ]
      }
      return [
        roleSkill(
          HYBRID_STANCE_IDS.caster,
          'Caster Stance',
          10,
          600,
          'Increases Skill Damage by 30%. Increases Intelligence by 50%.',
        ),
      ]
    default:
      return []
  }
}

export function isHybridStanceSkillId(skillId: string): boolean {
  return (
    skillId === HYBRID_STANCE_IDS.melee ||
    skillId === HYBRID_STANCE_IDS.ranged ||
    skillId === HYBRID_STANCE_IDS.caster
  )
}
