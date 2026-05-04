/**
 * Regression bench for auto rotation planner (default: Beelzebumon BM wiki fixture).
 * Usage: npx tsx scripts/planner-bench.ts
 * Env: PLANNER_BENCH_JSON=path/to/digimon.json (optional; defaults to ../tmp-d31fxga.json)
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { simulateRotation, TIER_DPS_SIM_REVISION } from '../src/lib/dpsSim.ts'
import type { WikiDigimonDetail } from '../src/types/wikiApi.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pathFromEnv = process.env.PLANNER_BENCH_JSON?.trim()
const rawPath = pathFromEnv ?? join(__dirname, '../tmp-d31fxga.json')
const raw = JSON.parse(readFileSync(rawPath, 'utf8')) as WikiDigimonDetail

const skills = raw.skills ?? []
const levelBySkillId = Object.fromEntries(skills.map((s) => [s.id, 25]))
const duration = 90
const targets = 1
const baseAttack = raw.stats?.attack ?? 0
const atkSpd = raw.stats?.atk_speed ?? 0
const crit = raw.stats?.crit_rate ?? 0

const r = simulateRotation(skills, levelBySkillId, duration, targets, baseAttack, atkSpd, crit, {
  role: raw.role,
  wikiInt: Math.max(0, Math.floor(raw.stats?.int ?? 0)),
  forceAutoCrit: true,
  perfectAtClone: true,
  autoAttackAnimationCancel: true,
  animCancelReactionSec: 0.3,
  attackerAttribute: raw.attribute ?? '',
  attackerElement: raw.element ?? '',
  applySavedGearTrueVice: false,
  hybridStance: 'best',
})

console.log(JSON.stringify({
  fixture: raw.id,
  name: raw.name,
  json: rawPath,
  tierDpsSimRevision: TIER_DPS_SIM_REVISION,
  durationSec: duration,
  dps: Math.round(r.dps * 100) / 100,
  totalDamage: Math.round(r.totalDamage),
  casts: r.casts,
}))
