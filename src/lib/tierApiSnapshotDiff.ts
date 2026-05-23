import type { TierApiSnapshot } from './tierList'

/** Field-level wiki snapshot diff for the Changes page and GHA rebuild. */
export function diffTierApiSnapshot(prev: TierApiSnapshot | undefined, next: TierApiSnapshot): string[] {
  if (!prev) return []
  const lines: string[] = []
  const push = (line: string) => {
    if (lines.length < 20) lines.push(line)
  }
  const normText = (v?: string) => (v ?? '').replace(/\s+/g, ' ').trim()
  const cmpNum = (label: string, a: number, b: number) => {
    if (a !== b) push(`${label}: ${a} -> ${b}`)
  }
  const cmpText = (label: string, a?: string, b?: string) => {
    if (normText(a) !== normText(b)) push(`${label}: "${normText(a)}" -> "${normText(b)}"`)
  }

  cmpText('Role', prev.role, next.role)
  cmpText('Attribute', prev.attribute, next.attribute)
  cmpText('Element', prev.element, next.element)
  cmpNum('Rank', prev.rank, next.rank)
  cmpNum('HP', prev.hp, next.hp)
  cmpNum('Attack', prev.attack, next.attack)
  for (const key of Object.keys(prev.stats) as Array<keyof TierApiSnapshot['stats']>) {
    if (key === 'hp' || key === 'attack') continue
    cmpNum(`Stats.${key}`, prev.stats[key], next.stats[key])
  }

  const prevSkills = new Map(prev.skills.map((s) => [s.id, s] as const))
  const nextSkills = new Map(next.skills.map((s) => [s.id, s] as const))
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
