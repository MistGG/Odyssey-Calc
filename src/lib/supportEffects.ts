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

export function parseSupportEffects(
  description: string,
  level: number,
): ParsedSupportEffect[] {
  if (!description.trim()) return []
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
    const action = m[1]
    const target = m[2].trim()
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

  // Example: "Recovers 15% HP", "Heals 1200 HP"
  const healDirectRe =
    /(Recovers|Restores|Heals)\s+(\d+(?:\.\d+)?)\s*(%?)\s+([A-Za-z][A-Za-z0-9\s/-]*)/gi
  for (const m of description.matchAll(healDirectRe)) {
    const action = m[1]
    const base = toNum(m[2])
    const unit = ((m[3] as '%' | '') || '') as '%' | ''
    const target = m[4].trim()
    out.push({
      label: `${action} ${target}`,
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
    const target = m[1].trim()
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
