import type { WikiSkill } from '../types/wikiApi'

export type ParsedSupportEffect = {
  label: string
  base: number
  perLevel: number
  unit: '%' | ''
  valueAtLevel: number
}

function toNum(v: string) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** True when the same clause continues with "+ N [per skill level|per Lv]" scaling. */
function hasPlusPerSkillLevelAfter(description: string, matchEndIndex: number) {
  const tail = description.slice(matchEndIndex)
  return (
    /^\s*\+\s*\d+(?:\.\d+)?\s*(?:%?)\s+per\s+(?:skill\s+level|Lv)\b/i.test(tail) ||
    /^\s*\(\s*\+?\s*\d+(?:\.\d+)?\s*(?:%?)\s*(?:\/\s*)?\s*per\s+skill\s+level\b/i.test(tail)
  )
}

/** "Attack Power +647 (+32/Lv)" — skip the flat "+647" when slash-Lv scaling follows. */
function hasShortSlashLvScaleAfter(description: string, matchEndIndex: number) {
  const tail = description.slice(matchEndIndex)
  return /^\s*\(\s*\+\s*\d+(?:\.\d+)?\s*(?:%?)\s*\/\s*Lv\)/i.test(tail)
}

function normalizeEffectLabel(raw: string) {
  const text = raw.trim().replace(/\s+/g, ' ')
  if (/^AT$/i.test(text)) return 'Attack Power'
  if (/^CT$/i.test(text)) return 'Critical Rate'
  if (/^HP$/i.test(text)) return 'HP'
  if (/^DS$/i.test(text)) return 'DS'
  if (/^dmg\s*reduction$/i.test(text)) return 'Damage Reduction'
  if (/^max\s*hp$/i.test(text)) return 'Max HP'
  return text
}

/** Display label for parsed heals (avoid "restores 2783 HP" prose in the label row). */
function healEffectLabel(targetRaw: string, _unit: '%' | ''): string {
  const t = targetRaw.trim().toLowerCase().replace(/\s+/g, ' ')
  if (t === 'hp' || (/\bhp\b/.test(t) && !/\bmax\b/.test(t))) return 'Heals HP'
  if (/\bmax\s*hp\b/.test(t)) return 'Heals Max HP'
  if (/\bds\b/.test(t)) return 'Restores DS'
  return `Heals ${normalizeEffectLabel(targetRaw)}`
}

/** Stat fragment before by/of/worth in generic +per-level matches — skip flavor / gerund clauses. */
function shouldSkipGenericScaleSubject(rawTarget: string): boolean {
  const s = rawTarget.trim()
  if (s.length > 46) return true
  if (
    /\b(restores?|restored|restoring|heals?|healing|recovers?|recovering|recovered)\b/i.test(s)
  ) {
    return true
  }
  if (
    /\b(increasing|decreasing|raising|boosting|releasing|releases?|gently)\b/i.test(s)
  ) {
    return true
  }
  return false
}

function isGerundStatTarget(target: string): boolean {
  return /^(increasing|decreasing|raising|boosting)\s+/i.test(target.trim())
}

function isJunkSupportLabel(label: string): boolean {
  const t = label.trim()
  if (/^Increases (increasing|decreasing|raising|boosting|restoring|releasing|Releases)\b/.test(t)) {
    return true
  }
  if (/^Increases and\b/i.test(t)) return true
  if (/^Recovers restoring\b/i.test(t)) return true
  if (/^Increases restoring\b/i.test(t)) return true
  return false
}

export function parseSupportEffects(
  description: string | undefined | null,
  level: number,
): ParsedSupportEffect[] {
  if (!description?.trim()) return []
  const L = Math.max(1, Math.floor(level))
  const out: ParsedSupportEffect[] = []

  // Example: "Increases Defense by 10 at Lv1, increasing by 2 per extra level."
  const scalingRe =
    /(Increases|Raises|Boosts|Reduces|Decreases|Recovers|Restores|Heals)\s+([A-Za-z][A-Za-z0-9\s%/-]*?)\s+by\s+(\d+(?:\.\d+)?)\s*(%?)\s+at\s+Lv1,\s+increasing\s+by\s+(\d+(?:\.\d+)?)\s*(%?)\s+per\s+(?:extra\s+)?level/gi
  for (const m of description.matchAll(scalingRe)) {
    const action = m[1]
    const target = m[2].trim()
    const base = toNum(m[3])
    const baseUnit = (m[4] as '%' | '') || ''
    const per = toNum(m[5])
    const perUnit = (m[6] as '%' | '') || baseUnit
    const unit = baseUnit || perUnit
    out.push({
      label: `${action} ${target}`,
      base,
      perLevel: per,
      unit,
      valueAtLevel: base + per * (L - 1),
    })
  }

  // Example: "Reduces all damage taken by 6%"
  const flatRe =
    /(Increases|Raises|Boosts|Reduces|Decreases|Recovers|Restores|Heals)\s+([A-Za-z][A-Za-z0-9\s%/-]*?)\s+by\s+(\d+(?:\.\d+)?)\s*(%?)/gi
  for (const m of description.matchAll(flatRe)) {
    const phrase = m[0]
    if (/at\s+Lv1,\s+increasing\s+by/i.test(phrase)) continue
    if (m.index !== undefined && hasPlusPerSkillLevelAfter(description, m.index + phrase.length)) continue
    const action = m[1]
    const target = m[2].trim()
    if (isGerundStatTarget(target)) continue
    const base = toNum(m[3])
    const unit = ((m[4] as '%' | '') || '') as '%' | ''
    out.push({
      label: `${action} ${target}`,
      base,
      perLevel: 0,
      unit,
      valueAtLevel: base,
    })
  }

  // Example: "Recovers 2783 HP + 167 per skill level"
  const healPlusScaleRe =
    /(Recovers|Restores|Heals)\s+(\d+(?:\.\d+)?)\s*(%?)\s+([A-Za-z][A-Za-z0-9\s/-]*?)\s*\+\s*(\d+(?:\.\d+)?)\s*(%?)\s+per\s+(?:skill\s+level|Lv)\b/gi
  for (const m of description.matchAll(healPlusScaleRe)) {
    const target = m[4].trim()
    const base = toNum(m[2])
    const baseUnit = (m[3] as '%' | '') || ''
    const per = toNum(m[5])
    const perUnit = (m[6] as '%' | '') || baseUnit
    const unit = baseUnit || perUnit
    out.push({
      label: healEffectLabel(target, unit),
      base,
      perLevel: per,
      unit,
      valueAtLevel: base + per * (L - 1),
    })
  }

  // Example: "absorbs 4120 + 180 per skill level", "blocking 3000 + 150 per Lv"
  const absorbPlusScaleRe =
    /\b(absorb(?:s|ing)?|block(?:s|ing)?)\s+(?:up\s+to\s+)?(\d+(?:\.\d+)?)\s*(%?)\s*(?:HP\b)?\s*\+\s*(\d+(?:\.\d+)?)\s*(%?)\s+per\s+(?:skill\s+level|Lv)\b/gi
  for (const m of description.matchAll(absorbPlusScaleRe)) {
    const base = toNum(m[2])
    const baseUnit = (m[3] as '%' | '') || ''
    const per = toNum(m[4])
    const perUnit = (m[5] as '%' | '') || baseUnit
    const unit = baseUnit || perUnit
    out.push({
      label: 'Absorbs damage (shield)',
      base,
      perLevel: per,
      unit,
      valueAtLevel: base + per * (L - 1),
    })
  }

  // "grants a Shield of 4245 (+212 per Skill Level)" (buff lines; distinct from "by X (+Y per …)")
  const shieldOfParenScaleRe =
    /\b(?:grant(?:s|ing)\s+(?:a\s+)?)?shield\s+of\s+(\d+(?:\.\d+)?)\s*(%?)\s*(?:HP\b)?\s*\(\s*\+?\s*(\d+(?:\.\d+)?)\s*(%?)\s*\/?\s*per\s+skill\s+level\)/gi
  for (const m of description.matchAll(shieldOfParenScaleRe)) {
    const base = toNum(m[1])
    const baseUnit = (m[2] as '%' | '') || ''
    const per = toNum(m[3])
    const perUnit = (m[4] as '%' | '') || baseUnit
    const unit = baseUnit || perUnit
    out.push({
      label: 'Shield',
      base,
      perLevel: per,
      unit,
      valueAtLevel: base + per * (L - 1),
    })
  }

  // Example: "granting a shield of 3859 HP + 192 per skill level"
  // Example: "sanctuary worth 4120 HP + 180 per skill level"
  // Example: "reduces incoming damage by 6% + 0.4% per skill level"
  const genericPlusScaleRe =
    /([A-Za-z][A-Za-z0-9\s/%'()-]*?)\s+(?:by|of|worth)\s+(\d+(?:\.\d+)?)\s*(%?)\s*(?:HP\b|DS\b)?\s*\+\s*(\d+(?:\.\d+)?)\s*(%?)\s+per\s+(?:skill\s+level|Lv)\b/gi
  for (const m of description.matchAll(genericPlusScaleRe)) {
    const rawTarget = m[1].trim().replace(/\s+/g, ' ')
    // Avoid matching a long clause that already includes a numeric heal (e.g. "… restores 2783 HP of 2783 + …").
    if (/\d/.test(rawTarget)) continue
    if (shouldSkipGenericScaleSubject(rawTarget)) continue
    // Prefer semantic labels so later bucketing can classify mitigation/heal effects.
    const label = /\b(reduce|decreas|incoming damage|damage taken)\b/i.test(rawTarget)
      ? `Reduces ${rawTarget}`
      : /\b(recover|restore|heal)\b/i.test(rawTarget)
        ? `Recovers ${rawTarget}`
        : `Increases ${rawTarget}`
    const base = toNum(m[2])
    const baseUnit = (m[3] as '%' | '') || ''
    const per = toNum(m[4])
    const perUnit = (m[5] as '%' | '') || baseUnit
    const unit = baseUnit || perUnit
    out.push({
      label,
      base,
      perLevel: per,
      unit,
      valueAtLevel: base + per * (L - 1),
    })
  }

  // Example: "Recovers 15% HP", "Heals 1200 HP"
  const healDirectRe =
    /(Recovers|Restores|Heals)\s+(\d+(?:\.\d+)?)\s*(%?)\s+([A-Za-z][A-Za-z0-9\s/-]*)/gi
  for (const m of description.matchAll(healDirectRe)) {
    const phrase = m[0]
    if (/\+\s*\d+(?:\.\d+)?\s*(?:%?)\s*per\s+(?:skill\s+level|Lv)\b/i.test(phrase)) continue
    if (m.index !== undefined && hasPlusPerSkillLevelAfter(description, m.index + phrase.length)) continue
    const base = toNum(m[2])
    const unit = ((m[3] as '%' | '') || '') as '%' | ''
    const target = m[4].trim()
    out.push({
      label: healEffectLabel(target, unit),
      base,
      perLevel: 0,
      unit,
      valueAtLevel: base,
    })
  }

  // Example: "Restores 5% DS (+1% per Skill Level)"
  const parenScaleRe =
    /(Increases|Raises|Boosts|Recovers|Restores|Heals)\s+([A-Za-z][A-Za-z0-9\s/-]*?)\s+by\s+(\d+(?:\.\d+)?)\s*(%?)\s*\(\+(\d+(?:\.\d+)?)\s*(%?)\s*\/?\s*per\s+skill\s+level\)/gi
  for (const m of description.matchAll(parenScaleRe)) {
    const action = m[1]
    const target = m[2].trim()
    if (isGerundStatTarget(target)) continue
    const base = toNum(m[3])
    const baseUnit = (m[4] as '%' | '') || ''
    const per = toNum(m[5])
    const perUnit = (m[6] as '%' | '') || baseUnit
    const unit = baseUnit || perUnit
    out.push({
      label: `${action} ${target}`,
      base,
      perLevel: per,
      unit,
      valueAtLevel: base + per * (L - 1),
    })
  }

  // Example second clause in same sentence:
  // "... and Attack Power by 155 (+118 per Skill Level)"
  const clauseScaleRe =
    /(?:^|\sand\s)([A-Za-z][A-Za-z0-9\s/-]*?)\s+by\s+(\d+(?:\.\d+)?)\s*(%?)\s*\(\+(\d+(?:\.\d+)?)\s*(%?)\s*\/?\s*per\s+skill\s+level\)/gi
  for (const m of description.matchAll(clauseScaleRe)) {
    const target = m[1].trim()
    if (isGerundStatTarget(target)) continue
    const base = toNum(m[2])
    const baseUnit = (m[3] as '%' | '') || ''
    const per = toNum(m[4])
    const perUnit = (m[5] as '%' | '') || baseUnit
    const unit = baseUnit || perUnit
    out.push({
      label: `Increases ${target}`,
      base,
      perLevel: per,
      unit,
      valueAtLevel: base + per * (L - 1),
    })
  }

  // Example shorthand from buff descriptions:
  // "Skill Damage +5% (+1%/Lv), Attack Power +155 (+118/Lv)"
  const shortScaleRe =
    /([A-Za-z][A-Za-z0-9\s/-]*?)\s*\+(\d+(?:\.\d+)?)\s*(%?)\s*\(\+(\d+(?:\.\d+)?)\s*(%?)\s*\/\s*Lv\)/gi
  for (const m of description.matchAll(shortScaleRe)) {
    const target = normalizeEffectLabel(m[1])
    const base = toNum(m[2])
    const baseUnit = (m[3] as '%' | '') || ''
    const per = toNum(m[4])
    const perUnit = (m[5] as '%' | '') || baseUnit
    const unit = baseUnit || perUnit
    out.push({
      label: `Increases ${target}`,
      base,
      perLevel: per,
      unit,
      valueAtLevel: base + per * (L - 1),
    })
  }

  // Example shorthand without per-level:
  // "AT +12%. CT +10% (20s). Max HP +15%. Dmg Reduction +15%"
  const shortFlatRe =
    /([A-Za-z][A-Za-z0-9\s/-]*?)\s*([+-])\s*(\d+(?:\.\d+)?)\s*(%?)(?:\s*\(\d+\s*s\))?/gi
  for (const m of description.matchAll(shortFlatRe)) {
    const phrase = m[0]
    if (m.index !== undefined && hasShortSlashLvScaleAfter(description, m.index + phrase.length)) continue
    const target = normalizeEffectLabel(m[1])
    const sign = m[2] === '-' ? -1 : 1
    const base = sign * toNum(m[3])
    const unit = ((m[4] as '%' | '') || '') as '%' | ''
    out.push({
      label: sign < 0 ? `Decreases ${target}` : `Increases ${target}`,
      base,
      perLevel: 0,
      unit,
      valueAtLevel: base,
    })
  }

  // Deduplicate simple overlaps from regex passes.
  const seen = new Set<string>()
  return out.filter((e) => {
    const k = `${e.label}|${e.base}|${e.perLevel}|${e.unit}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

const BUFF_META_KEYS = new Set(['id', 'name', 'description', 'duration', 'is_debuff'])

function titleCaseKey(k: string) {
  return k
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Extract numeric buff fields when API returns structured values
 * (e.g. attack_pct, defense_flat, per_level).
 */
export function parseBuffNumericEffects(
  buff: Record<string, unknown> | undefined,
  level: number,
): ParsedSupportEffect[] {
  if (!buff) return []
  const L = Math.max(1, Math.floor(level))
  const out: ParsedSupportEffect[] = []
  for (const [key, value] of Object.entries(buff)) {
    if (BUFF_META_KEYS.has(key)) continue
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    const unit: '%' | '' = /pct|percent|rate/i.test(key) ? '%' : ''
    out.push({
      label: titleCaseKey(key),
      base: value,
      perLevel: 0,
      unit,
      valueAtLevel: value,
    })
  }

  // Common companion per-level key pattern, e.g. attack_pct + attack_pct_per_level
  for (const [key, value] of Object.entries(buff)) {
    if (!/_per_level$/i.test(key)) continue
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    const baseKey = key.replace(/_per_level$/i, '')
    const baseVal = typeof buff[baseKey] === 'number' ? (buff[baseKey] as number) : 0
    const unit: '%' | '' = /pct|percent|rate/i.test(baseKey) ? '%' : ''
    out.push({
      label: titleCaseKey(baseKey),
      base: baseVal,
      perLevel: value,
      unit,
      valueAtLevel: baseVal + value * (L - 1),
    })
  }

  const seen = new Set<string>()
  return out.filter((e) => {
    const k = `${e.label}|${e.base}|${e.perLevel}|${e.unit}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/**
 * Prefer `buff.description` (structured buff lines) over the skill flavor `description`
 * so we do not parse the same stats twice when both repeat the same numbers.
 */
export function supportEffectParseText(skill: Pick<WikiSkill, 'description' | 'buff'>): string {
  const buffDesc = skill.buff?.description?.trim()
  if (buffDesc) return buffDesc
  return skill.description?.trim() ?? ''
}

/** Parse buff lines and skill flavor (when different) so heals/shields in flavor are not dropped. */
export function parseSupportEffectsFromSkill(
  skill: Pick<WikiSkill, 'description' | 'buff'>,
  level: number,
): ParsedSupportEffect[] {
  const L = Math.max(1, Math.floor(level))
  const buffDesc = skill.buff?.description?.trim()
  const skillDesc = skill.description?.trim()
  const fromBuff = buffDesc ? parseSupportEffects(buffDesc, L) : []
  const fromSkill =
    skillDesc && skillDesc !== buffDesc ? parseSupportEffects(skillDesc, L) : []
  return preferBuffStatBuckets(fromBuff, fromSkill)
}

function effectStatBucket(e: ParsedSupportEffect): string {
  const l = e.label.toLowerCase()
  const u = e.unit
  if (/\bskill\s*(damage|dmg)\b/i.test(l) || /\bskill\s*damage\s*pct\b/i.test(l)) return `skill_dmg|${u}`
  if (/\battack\s*speed\b/i.test(l)) return `atk_spd|${u}`
  if (/\bcritical\s*damage\b|\bcrit\s*damage\b|\bcd\b/i.test(l)) return `crit_dmg|${u}`
  if (/\bcritical\s*rate\b|\bcrit\s*rate\b|\bct\b/i.test(l)) return `crit_rate|${u}`
  if (/\bhit\s*rate\b/i.test(l)) return `hit_rate|${u}`
  if (/\bdefense\b|\bdefence\b/i.test(l)) return `def|${u}`
  if (/\bdamage\s*reduction\b|\bdmg\s*reduction\b|\bincoming\s*damage\b|\bdamage\s*taken\b/i.test(l)) {
    return `dmg_red|${u}`
  }
  if (/\bmax\s*hp\b/i.test(l)) return `max_hp|${u}`
  if ((/\bhp\b/i.test(l) || /^heals\b/i.test(l)) && !/max/.test(l)) return `hp|${u}`
  if (/\bds\b/i.test(l)) return `ds|${u}`
  if (/\babsorb\b/i.test(l) && /\bshield\b/i.test(l)) return `shield|${u}`
  if (/\bshield\b|\bbarrier\b/i.test(l)) return `shield|${u}`
  if (
    /\battack\s*power\b/i.test(l) ||
    /\battack\s*pct\b/i.test(l) ||
    /\battack\s*flat\b/i.test(l) ||
    (/\battack\b/i.test(l) && !/\battack\s*speed\b/i.test(l)) ||
    /\batk\b/i.test(l)
  ) {
    return `atk|${u}`
  }
  return `other|${l}|${u}`
}

/**
 * When structured buff text exists, prefer its numeric effects per stat bucket so flavor text
 * (e.g. outdated shield HP) does not override wiki buff lines.
 */
function preferBuffStatBuckets(
  buffEffects: ParsedSupportEffect[],
  skillEffects: ParsedSupportEffect[],
): ParsedSupportEffect[] {
  if (buffEffects.length === 0) return skillEffects
  const buffBuckets = new Set<string>()
  for (const e of buffEffects) {
    buffBuckets.add(effectStatBucket(e))
  }
  const fromSkill = skillEffects.filter((e) => {
    const b = effectStatBucket(e)
    if (b.startsWith('other|')) return true
    return !buffBuckets.has(b)
  })
  return [...buffEffects, ...fromSkill]
}

function labelStyleRank(label: string): number {
  const t = label.trim().toLowerCase()
  if (t.startsWith('increases ') || t.startsWith('decreases ')) return 3
  if (t.startsWith('reduces ') || t.startsWith('recovers ') || t.startsWith('restores ')) return 3
  if (t.startsWith('heals ')) return 3
  if (t === 'shield') return 3
  if (t.startsWith('raises ') || t.startsWith('boosts ')) return 2
  return 1
}

function preferSupportEffect(a: ParsedSupportEffect, b: ParsedSupportEffect): ParsedSupportEffect {
  const ra = labelStyleRank(a.label)
  const rb = labelStyleRank(b.label)
  if (rb !== ra) return rb > ra ? b : a
  if (a.label.length !== b.label.length) return a.label.length <= b.label.length ? a : b
  return a
}

/** Collapse duplicate rows from flavor + buff text + numeric buff keys describing the same stat. */
export function dedupeSupportEffectsByStat(effects: ParsedSupportEffect[]): ParsedSupportEffect[] {
  const map = new Map<string, ParsedSupportEffect>()
  for (const e of effects) {
    const key = `${effectStatBucket(e)}|${e.base}|${e.perLevel}|${e.unit}`
    const prev = map.get(key)
    if (!prev) {
      map.set(key, e)
      continue
    }
    map.set(key, preferSupportEffect(prev, e))
  }
  return [...map.values()]
}

/**
 * Drop flat rows whose Lv1 value matches a scaled row's base in the same stat bucket (duplicate
 * parses: "by 647" vs "647 (+32/lvl)", buff line + flavor). Secondary flats with a different amount
 * (e.g. bonus tick heal) are kept.
 */
function mergeFlatWhenScaledExists(effects: ParsedSupportEffect[]): ParsedSupportEffect[] {
  const scaledBasesByBucket = new Map<string, Set<number>>()
  for (const e of effects) {
    if (e.perLevel <= 0) continue
    const b = effectStatBucket(e)
    if (b.startsWith('other|')) continue
    let set = scaledBasesByBucket.get(b)
    if (!set) {
      set = new Set()
      scaledBasesByBucket.set(b, set)
    }
    set.add(e.base)
  }
  if (scaledBasesByBucket.size === 0) return effects
  return effects.filter((e) => {
    if (e.perLevel !== 0) return true
    const b = effectStatBucket(e)
    if (b.startsWith('other|')) return true
    const bases = scaledBasesByBucket.get(b)
    if (!bases || bases.size === 0) return true
    return !bases.has(e.base)
  })
}

function filterJunkSupportEffects(effects: ParsedSupportEffect[]): ParsedSupportEffect[] {
  return effects.filter((e) => !isJunkSupportLabel(e.label))
}

/** Parsed lines for display and sim: buff text (preferred) + numeric buff fields, deduped. */
export function buildSupportSkillEffects(skill: WikiSkill, level: number): ParsedSupportEffect[] {
  const L = Math.max(1, Math.floor(level))
  const fromText = parseSupportEffectsFromSkill(skill, L)
  const fromNums = parseBuffNumericEffects(skill.buff, L)
  return mergeFlatWhenScaledExists(
    filterJunkSupportEffects(dedupeSupportEffectsByStat([...fromText, ...fromNums])),
  )
}
