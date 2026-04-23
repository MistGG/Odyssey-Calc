import type { WikiSkill } from '../types/wikiApi'

export type ParsedSupportEffect = {
  label: string
  base: number
  perLevel: number
  unit: '%' | ''
  valueAtLevel: number
  /** Regen / tick HoT: seconds between ticks (from parsed "every Ns"); not shown in UI label. */
  hotIntervalSec?: number
}

/** Canonical display for periodic HoT and HoT % buffs (wiki "HoT +8%", regen lines, etc.). */
export const HEAL_OVER_TIME_LABEL = 'Heal Over Time' as const

function toNum(v: string) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Parses wiki amounts like `1,122` or `1122`. */
function amountToNum(raw: string) {
  return toNum(raw.replace(/,/g, ''))
}

/** Digits with optional thousands separators (e.g. 1,222,333). */
const AMOUNT_NUM = String.raw`(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d+)?`

/** True when the same clause continues with "+ N [per skill level|per Lv]" scaling. */
function hasPlusPerSkillLevelAfter(description: string, matchEndIndex: number) {
  const tail = description.slice(matchEndIndex)
  return (
    /^\s*\+\s*\d+(?:\.\d+)?\s*(?:%?)\s+per\s+(?:skill\s+level|Lv)\b/i.test(tail) ||
    /^\s*\(\s*\+?\s*\d+(?:\.\d+)?\s*(?:%?)\s*(?:\/\s*)?\s*per\s+skill\s+level\b/i.test(tail) ||
    /^\s*\(\s*\+?\s*\d+(?:\.\d+)?\s*(?:%?)\s+per\s+skill\s+level\s*\)/i.test(tail) ||
    /^\s*\(\s*\+?\s*\d+(?:\.\d+)?\s*(?:%?)\s*\/\s*skill\s+level\s*\)/i.test(tail) ||
    /^\s*\(\s*\+?\s*\d+(?:\.\d+)?\s*(?:%?)\s*per\s+Lv\s*\)/i.test(tail) ||
    /^\s+at\s+Lv1\s*,\s*increasing\s+by\s+\d/i.test(tail)
  )
}

/** "Attack Power +647 (+32/Lv)" — skip the flat "+647" when slash-Lv scaling follows. */
function hasShortSlashLvScaleAfter(description: string, matchEndIndex: number) {
  const tail = description.slice(matchEndIndex)
  return /^\s*\(\s*\+\s*\d+(?:\.\d+)?\s*(?:%?)\s*\/\s*Lv\)/i.test(tail)
}

/** Map wiki gerund clauses ("…, increasing Evasion") to the same wording as finite-verb lines. */
function displayStatVerb(action: string): string {
  const v = action.trim()
  if (/^increases$/i.test(v)) return 'Increases'
  if (/^reduces$/i.test(v)) return 'Reduces'
  if (/^decreases$/i.test(v)) return 'Decreases'
  if (/^increasing$/i.test(v)) return 'Increases'
  if (/^raising$/i.test(v)) return 'Raises'
  if (/^boosting$/i.test(v)) return 'Boosts'
  if (/^reducing$/i.test(v)) return 'Reduces'
  if (/^decreasing$/i.test(v)) return 'Decreases'
  return v
}

function statClauseLabel(action: string, target: string) {
  return `${displayStatVerb(action)} ${normalizeEffectLabel(target.trim())}`
}

/**
 * Wiki phrasing varies ("Reduces damage taken" vs "Reduces all damage taken"); tier scoring
 * treats them the same. Collapse to one UI / dedupe label.
 */
export function normalizeDamageReductionDisplayLabel(label: string): string {
  const t = label.trim()
  if (/^(?:increases|raising|boosts)\s+/i.test(t)) return label
  const l = t.toLowerCase()
  if (
    /\bdmg\s*reduction\b/.test(l) ||
    /\bdamage\s+reduction\b/.test(l) ||
    /\breduces\s+all\s+damage\b/.test(l) ||
    /\breduces\s+damage\s+taken\b/.test(l) ||
    /\b(?:reduces|decreases)\s+incoming\s+damage\b/.test(l)
  ) {
    return 'Damage Reduction'
  }
  return label
}

/** Wiki buff lines use "DP" for the in-game DE (defense) stat — not DPS. */
export function normalizeWikiDpAsDeLabel(label: string): string {
  return label.replace(/\bdp\b/gi, 'DE')
}

function normalizeEffectLabel(raw: string) {
  const text = raw.trim().replace(/\s+/g, ' ')
  if (/^AT$/i.test(text)) return 'Attack Power'
  if (/^CT$/i.test(text)) return 'Critical Rate'
  if (/^HP$/i.test(text)) return 'HP'
  if (/^DS$/i.test(text)) return 'DS'
  if (/^DP$/i.test(text)) return 'DE'
  if (/^DE$/i.test(text)) return 'DE'
  if (/^dmg\s*reduction$/i.test(text)) return 'Damage Reduction'
  if (/^max\s*hp$/i.test(text)) return 'Max HP'
  if (/^ev$/i.test(text)) return 'Evasion'
  if (/^hot$/i.test(text)) return HEAL_OVER_TIME_LABEL
  return text
}

/** ShortFlat/shortScale may capture "Increases EV +325"; strip the verb so we do not emit "Increases Increases …". */
function normalizeShortStatPhrase(captured: string): string {
  return normalizeEffectLabel(
    captured.replace(
      /^(increases|decreases|reduces|raises|boosts|recovers|restores|heals)\s+/i,
      '',
    ),
  )
}

function normalizeHealOverTimeDisplayLabel(label: string): string {
  const t = label.trim()
  if (/^increases hot$/i.test(t)) return HEAL_OVER_TIME_LABEL
  if (/^increases heal over time$/i.test(t)) return HEAL_OVER_TIME_LABEL
  if (/^heals hp \(over time/i.test(t)) return HEAL_OVER_TIME_LABEL
  return label
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

/** " and increases EV by … (+N per …)" — capture group wrongly includes the verb; full line is handled by parenScaleRe. */
function isVerbLedClauseSubject(target: string): boolean {
  return /^(increases|reduces|decreases|raises|boosts|recovers|restores|heals)\s+/i.test(target.trim())
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
    /(Increases|Raises|Boosts|Increasing|Raising|Boosting|Reduces|Decreases|Reducing|Decreasing|Recovers|Restores|Heals)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9\s%/-]*?)\s+by\s+(\d+(?:\.\d+)?)\s*(%?)\s+at\s+Lv1,\s+increasing\s+by\s+(\d+(?:\.\d+)?)\s*(%?)\s+per\s+(?:extra\s+)?level/gi
  for (const m of description.matchAll(scalingRe)) {
    const action = m[1]
    const target = m[2].trim()
    // Avoid "Reduces damage taken by 25% and increases Max HP by 80 at Lv1…" matching as one DR scaling row.
    if (/\bby\b/i.test(target)) continue
    const base = toNum(m[3])
    const baseUnit = (m[4] as '%' | '') || ''
    const per = toNum(m[5])
    const perUnit = (m[6] as '%' | '') || baseUnit
    const unit = baseUnit || perUnit
    out.push({
      label: statClauseLabel(action, target),
      base,
      perLevel: per,
      unit,
      valueAtLevel: base + per * (L - 1),
    })
  }

  // Second clause after "… by 25% and increases Max HP by 80 at Lv1, …" (main scalingRe span is skipped as bogus).
  const scalingAfterAndRe =
    /\band\s+(Increases|Raises|Boosts|Increasing|Raising|Boosting)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9\s%/-]*?)\s+by\s+(\d+(?:\.\d+)?)\s*(%?)\s+at\s+Lv1,\s+increasing\s+by\s+(\d+(?:\.\d+)?)\s*(%?)\s+per\s+(?:extra\s+)?level/gi
  for (const m of description.matchAll(scalingAfterAndRe)) {
    const action = m[1]
    const target = m[2].trim()
    if (/\bby\b/i.test(target)) continue
    const base = toNum(m[3])
    const baseUnit = (m[4] as '%' | '') || ''
    const per = toNum(m[5])
    const perUnit = (m[6] as '%' | '') || baseUnit
    const unit = baseUnit || perUnit
    out.push({
      label: statClauseLabel(action, target),
      base,
      perLevel: per,
      unit,
      valueAtLevel: base + per * (L - 1),
    })
  }

  // "Increases Evasion by 100 (5/skill level)" — wiki flavor often uses slash form without "+" or "per" inside parens.
  const parenSlashSkillLevelRe =
    /(Increases|Raises|Boosts|Increasing|Raising|Boosting|Reduces|Decreases|Reducing|Decreasing|Recovers|Restores|Heals)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9\s/-]*?)\s+by\s+(\d+(?:\.\d+)?)\s*(%?)\s*\(\s*\+?\s*(\d+(?:\.\d+)?)\s*(%?)\s*\/\s*skill\s+level\s*\)/gi
  for (const m of description.matchAll(parenSlashSkillLevelRe)) {
    const action = m[1]
    const target = m[2].trim()
    if (isGerundStatTarget(target)) continue
    const base = toNum(m[3])
    const baseUnit = (m[4] as '%' | '') || ''
    const per = toNum(m[5])
    const perUnit = (m[6] as '%' | '') || baseUnit
    const unit = baseUnit || perUnit
    out.push({
      label: statClauseLabel(action, target),
      base,
      perLevel: per,
      unit,
      valueAtLevel: base + per * (L - 1),
    })
  }

  // Example: "Reduces all damage taken by 6%"
  const flatRe =
    /(Increases|Raises|Boosts|Increasing|Raising|Boosting|Reduces|Decreases|Reducing|Decreasing|Recovers|Restores|Heals)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9\s%/-]*?)\s+by\s+(\d+(?:\.\d+)?)\s*(%?)/gi
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
      label: statClauseLabel(action, target),
      base,
      perLevel: 0,
      unit,
      valueAtLevel: base,
    })
  }

  // Example: "Recovers 2783 HP + 167 per skill level", "restoring 4631 HP + 232 per skill level"
  const healPlusScaleRe = new RegExp(
    String.raw`(Recovers|Restores|Heals|Recovering|Restoring|Healing)\s+(${AMOUNT_NUM})\s*(%?)\s+([A-Za-z][A-Za-z0-9\s/-]*?)\s*\+\s*(${AMOUNT_NUM})\s*(%?)\s+per\s+(?:skill\s+level|Lv)\b`,
    'gi',
  )
  for (const m of description.matchAll(healPlusScaleRe)) {
    const target = m[4].trim()
    const base = amountToNum(m[2])
    const baseUnit = (m[3] as '%' | '') || ''
    const per = amountToNum(m[5])
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

  // "Recovers 5800 HP (+105 per Lv)." — paren scaling (wiki shorthand)
  const healHpParenPerLvRe = new RegExp(
    String.raw`\b(Recovers|Restores|Heals)\s+(${AMOUNT_NUM})\s*(%?)\s+HP\s*\(\s*\+?\s*(${AMOUNT_NUM})\s*(%?)\s*per\s+(?:Lv|skill\s+level)\s*\)`,
    'gi',
  )
  for (const m of description.matchAll(healHpParenPerLvRe)) {
    const base = amountToNum(m[2])
    const baseUnit = (m[3] as '%' | '') || ''
    const per = amountToNum(m[4])
    const perUnit = (m[5] as '%' | '') || baseUnit
    const unit = baseUnit || perUnit
    out.push({
      label: healEffectLabel('HP', unit),
      base,
      perLevel: per,
      unit,
      valueAtLevel: base + per * (L - 1),
    })
  }

  // "Regenerates 90 HP every 3s (+3 per Lv)." — heal over time (standardized label)
  const regenHotParenPerLvRe = new RegExp(
    String.raw`\bRegenerates?\s+(${AMOUNT_NUM})\s*(%?)\s+HP\s+every\s+(${AMOUNT_NUM})\s*s(?:ec(?:ond)?s?)?\s*(?:\(\s*\+?\s*(${AMOUNT_NUM})\s*(%?)\s*per\s+(?:Lv|skill\s+level)\s*\))?`,
    'gi',
  )
  for (const m of description.matchAll(regenHotParenPerLvRe)) {
    const base = amountToNum(m[1])
    const baseUnit = (m[2] as '%' | '') || ''
    const intervalSec = amountToNum(m[3])
    const per = m[4] !== undefined ? amountToNum(m[4]) : 0
    const perUnit = (m[5] as '%' | '') || baseUnit
    const unit = baseUnit || perUnit
    out.push({
      label: HEAL_OVER_TIME_LABEL,
      base,
      perLevel: per,
      unit,
      valueAtLevel: base + per * (L - 1),
      hotIntervalSec: intervalSec > 0 ? intervalSec : undefined,
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

  // "Generates a barrier that absorbs 10% of Max HP as damage"
  const absorbPctOfMaxHpRe =
    /\b(?:barrier|shield|aegis)\s+(?:that\s+)?absorb(?:s|ing)?\s+(\d+(?:\.\d+)?)\s*%\s+of\s+(?:the\s+)?max\s*hp\b/gi
  for (const m of description.matchAll(absorbPctOfMaxHpRe)) {
    const pct = toNum(m[1])
    out.push({
      label: SHIELD_PCT_OF_MAX_HP_LABEL,
      base: pct,
      perLevel: 0,
      unit: '%',
      valueAtLevel: pct,
    })
  }

  // "Generates a barrier absorbing 100 damage at Lv1, increasing by 54 per extra level."
  const barrierAbsorbLvScaleRe = new RegExp(
    String.raw`\b(?:barrier|shield)\s+(?:that\s+)?absorb(?:s|ing)?\s+(${AMOUNT_NUM})\s*(%?)\s*(?:damage|hp)?(?:\s+at\s+Lv\d+\s*,?)?\s*increasing\s+by\s+(${AMOUNT_NUM})\s*(%?)\s+per\s+(?:extra\s+)?(?:skill\s+)?level\b`,
    'gi',
  )
  for (const m of description.matchAll(barrierAbsorbLvScaleRe)) {
    const base = amountToNum(m[1])
    const baseUnit = (m[2] as '%' | '') || ''
    const per = amountToNum(m[3])
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

  // "Shield 4245 increasing by 212 per level" / "per skill level" (common in skill flavor text)
  const shieldIncreasingByRe =
    /\b(?:the\s+)?(?:a\s+)?shield\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*(%?)\s*(?:HP\b)?(?:\s+at\s+Lv\d+\s*,?)?\s*increasing\s+by\s+(\d+(?:\.\d+)?)\s*(%?)\s+per\s+(?:extra\s+)?(?:skill\s+)?level\b/gi
  for (const m of description.matchAll(shieldIncreasingByRe)) {
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

  // Example: "Recovers 15% HP", "Heals 1200 HP", "Restores 1,122 HP", "while restoring 1,122 HP"
  const healDirectRe = new RegExp(
    String.raw`(Recovers|Restores|Heals|Recovering|Restoring|Healing)\s+(${AMOUNT_NUM})\s*(%?)\s+([A-Za-z][A-Za-z0-9\s/-]*)`,
    'gi',
  )
  for (const m of description.matchAll(healDirectRe)) {
    const phrase = m[0]
    if (/\+\s*\d+(?:\.\d+)?\s*(?:%?)\s*per\s+(?:skill\s+level|Lv)\b/i.test(phrase)) continue
    if (m.index !== undefined && hasPlusPerSkillLevelAfter(description, m.index + phrase.length)) continue
    if (m.index !== undefined) {
      const tail = description.slice(m.index + phrase.length)
      if (/^\s*\(\s*\+?\s*\d+(?:\.\d+)?\s*(?:%?)\s*per\s+(?:Lv|skill\s+level)\s*\)/i.test(tail)) {
        continue
      }
    }
    const base = amountToNum(m[2])
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
    /(Increases|Raises|Boosts|Increasing|Raising|Boosting|Reduces|Decreases|Reducing|Decreasing|Recovers|Restores|Heals)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9\s/-]*?)\s+by\s+(\d+(?:\.\d+)?)\s*(%?)\s*\(\+(\d+(?:\.\d+)?)\s*(%?)\s*\/?\s*per\s+skill\s+level\)/gi
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
      label: statClauseLabel(action, target),
      base,
      perLevel: per,
      unit,
      valueAtLevel: base + per * (L - 1),
    })
  }

  // Example second clause in same sentence:
  // "... and Attack Power by 155 (+118 per Skill Level)"
  const clauseScaleRe =
    /(?:^|\sand\s)(?:the\s+)?([A-Za-z][A-Za-z0-9\s/-]*?)\s+by\s+(\d+(?:\.\d+)?)\s*(%?)\s*\(\+(\d+(?:\.\d+)?)\s*(%?)\s*\/?\s*per\s+skill\s+level\)/gi
  for (const m of description.matchAll(clauseScaleRe)) {
    const target = m[1].trim()
    if (isGerundStatTarget(target) || isVerbLedClauseSubject(target)) continue
    const base = toNum(m[2])
    const baseUnit = (m[3] as '%' | '') || ''
    const per = toNum(m[4])
    const perUnit = (m[5] as '%' | '') || baseUnit
    const unit = baseUnit || perUnit
    out.push({
      label: `Increases ${normalizeEffectLabel(target)}`,
      base,
      perLevel: per,
      unit,
      valueAtLevel: base + per * (L - 1),
    })
  }

  const clauseSlashSkillLevelRe =
    /(?:^|\sand\s)(?:the\s+)?([A-Za-z][A-Za-z0-9\s/-]*?)\s+by\s+(\d+(?:\.\d+)?)\s*(%?)\s*\(\s*\+?\s*(\d+(?:\.\d+)?)\s*(%?)\s*\/\s*skill\s+level\s*\)/gi
  for (const m of description.matchAll(clauseSlashSkillLevelRe)) {
    const target = m[1].trim()
    if (isGerundStatTarget(target) || isVerbLedClauseSubject(target)) continue
    const base = toNum(m[2])
    const baseUnit = (m[3] as '%' | '') || ''
    const per = toNum(m[4])
    const perUnit = (m[5] as '%' | '') || baseUnit
    const unit = baseUnit || perUnit
    out.push({
      label: `Increases ${normalizeEffectLabel(target)}`,
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
    const target = normalizeShortStatPhrase(m[1])
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
    // "… restores 2783 HP + 167 per skill level" — +N is heal/absorb scaling, not "Stat +N" shorthand.
    if (m.index !== undefined && m[2] === '+') {
      const tail = description.slice(m.index + phrase.length)
      if (/^\s*per\s+(?:skill\s+level|(?:extra\s+)?level|Lv)\b/i.test(tail)) continue
    }
    const target = normalizeShortStatPhrase(m[1])
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
  return out
    .map((e) => ({
      ...e,
      label: normalizeHealOverTimeDisplayLabel(
        normalizeWikiDpAsDeLabel(normalizeDamageReductionDisplayLabel(e.label)),
      ),
    }))
    .filter((e) => {
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

function displayLabelForBuffNumericKey(key: string): string {
  if (/\bhot\b/i.test(key.replace(/_/g, ' '))) return HEAL_OVER_TIME_LABEL
  return titleCaseKey(key)
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
      label: normalizeWikiDpAsDeLabel(displayLabelForBuffNumericKey(key)),
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
      label: normalizeWikiDpAsDeLabel(displayLabelForBuffNumericKey(baseKey)),
      base: baseVal,
      perLevel: value,
      unit,
      valueAtLevel: baseVal + value * (L - 1),
    })
  }

  const seen = new Set<string>()
  return out
    .map((e) => ({
      ...e,
      label: normalizeHealOverTimeDisplayLabel(
        normalizeWikiDpAsDeLabel(normalizeDamageReductionDisplayLabel(e.label)),
      ),
    }))
    .filter((e) => {
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

function isTrivialBuffDescription(desc: string): boolean {
  const t = desc.trim()
  if (t.length === 0) return true
  if (t.length <= 5) return true
  if (/^(?:n\/?a|none|tbd|null|—|-|–|\.\.\.|…|\.)$/i.test(t)) return true
  return false
}

/** True when buff.description decoded into at least one stat we bucket (not only unmodeled junk). */
function parsedBuffContributesModeledStats(effects: ParsedSupportEffect[]): boolean {
  return effects.some((e) => !effectStatBucket(e).startsWith('other|'))
}

function countModeledParsedEffects(effects: ParsedSupportEffect[]): number {
  return effects.filter((e) => !effectStatBucket(e).startsWith('other|')).length
}

/**
 * Parse buff lines + skill flavor. When `buff.description` encodes real stats, it wins per stat
 * bucket; skill flavor may still contribute **extra** heals / shields / max-HP / DS lines the buff
 * line often omits (e.g. Judgment of the Worthy). Flavor-only DR/def/evasion is not merged in that
 * case (e.g. Courage Flame). Otherwise prefer richer skill text when the buff line is fluff.
 */
export function parseSupportEffectsFromSkill(
  skill: Pick<WikiSkill, 'description' | 'buff'>,
  level: number,
): ParsedSupportEffect[] {
  const L = Math.max(1, Math.floor(level))
  const buffDesc = skill.buff?.description?.trim()
  const skillDesc = skill.description?.trim()
  const parsedBuff = buffDesc ? parseSupportEffects(buffDesc, L) : []
  const parsedSkill =
    skillDesc && skillDesc !== buffDesc ? parseSupportEffects(skillDesc, L) : []

  /** Buff lines from the API often carry the correct numbers; flavor can be wrong or poetic even when longer. */
  const buffTextAuthoritative =
    buffDesc !== undefined &&
    buffDesc.length > 0 &&
    !isTrivialBuffDescription(buffDesc) &&
    parsedBuffContributesModeledStats(parsedBuff)

  /** Skill-only when flavor is strictly richer and buff is non-numeric fluff (e.g. Sky Dominance, Burning Will). */
  const skillFlavorHasMoreStats =
    Boolean(
      buffDesc &&
        skillDesc &&
        skillDesc !== buffDesc &&
        (skillDesc.length >= buffDesc.length + 40 ||
          countModeledParsedEffects(parsedSkill) > countModeledParsedEffects(parsedBuff)),
    )

  if (skillFlavorHasMoreStats && !buffTextAuthoritative) {
    return preferBuffStatBuckets([], parsedSkill)
  }

  if (buffTextAuthoritative) {
    return preferBuffStatBuckets(parsedBuff, parsedSkill, SKILL_ONLY_BUCKETS_WHEN_BUFF_AUTHORITATIVE)
  }

  if (parsedSkill.length > 0) {
    return preferBuffStatBuckets([], parsedSkill)
  }

  return parsedBuff
}

function effectStatBucket(e: ParsedSupportEffect): string {
  const l = e.label.toLowerCase()
  const u = e.unit
  if (/\bskill\s*(damage|dmg)\b/i.test(l) || /\bskill\s*damage\s*pct\b/i.test(l)) return `skill_dmg|${u}`
  if (/\battack\s*speed\b/i.test(l)) return `atk_spd|${u}`
  if (/\bcritical\s*damage\b|\bcrit\s*damage\b|\bcd\b/i.test(l)) return `crit_dmg|${u}`
  if (/\bcritical\s*rate\b|\bcrit\s*rate\b|\bct\b/i.test(l)) return `crit_rate|${u}`
  if (/\bhit\s*rate\b/i.test(l)) return `hit_rate|${u}`
  if (/\bdefense\b|\bdefence\b|\bde\b|\bdp\b/i.test(l)) return `def|${u}`
  if (/\bevasion\b/i.test(l)) return `eva|${u}`
  if (/\bblock\s*rate\b/i.test(l)) return `block|${u}`
  if (/\bdamage\s*reduction\b|\bdmg\s*reduction\b|\bincoming\s*damage\b|\bdamage\s*taken\b/i.test(l)) {
    return `dmg_red|${u}`
  }
  if (/\bmax\s*hp\b/i.test(l)) return `max_hp|${u}`
  if (l.trim() === 'heal over time') return `hp|${u}`
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

/** Exposed for tier scoring (tank stat subcategories). */
export function supportEffectStatBucket(e: ParsedSupportEffect): string {
  return effectStatBucket(e)
}

/**
 * Skill buckets often omitted from short buff lines but present in flavor (heal, shield, etc.).
 * We do not pull conflicting mitigation stats (DR, def, evasion) from flavor when buff is authoritative.
 */
const SKILL_ONLY_BUCKETS_WHEN_BUFF_AUTHORITATIVE: readonly string[] = [
  'hp|',
  'ds|',
  'max_hp|',
  'shield|',
]

/**
 * When structured buff text exists, prefer its numeric effects per stat bucket so flavor text
 * (e.g. outdated shield HP) does not override wiki buff lines.
 */
function preferBuffStatBuckets(
  buffEffects: ParsedSupportEffect[],
  skillEffects: ParsedSupportEffect[],
  /** When set, only skill rows in these bucket prefixes are kept if buff did not already cover that bucket. */
  skillOnlyAllowBucketPrefixes?: readonly string[],
): ParsedSupportEffect[] {
  if (buffEffects.length === 0) return skillEffects
  const buffBuckets = new Set<string>()
  for (const e of buffEffects) {
    buffBuckets.add(effectStatBucket(e))
  }
  const fromSkill = skillEffects.filter((e) => {
    const b = effectStatBucket(e)
    if (b.startsWith('other|')) return true
    if (buffBuckets.has(b)) return false
    if (skillOnlyAllowBucketPrefixes && skillOnlyAllowBucketPrefixes.length > 0) {
      return skillOnlyAllowBucketPrefixes.some((p) => b.startsWith(p))
    }
    return true
  })
  return [...buffEffects, ...fromSkill]
}

function labelStyleRank(label: string): number {
  const t = label.trim().toLowerCase()
  if (t === 'heal over time') return 3
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
  let pick: ParsedSupportEffect
  if (rb !== ra) pick = rb > ra ? b : a
  else if (a.label.length !== b.label.length) pick = a.label.length <= b.label.length ? a : b
  else pick = a
  const other = pick === a ? b : a
  const hotSec = pick.hotIntervalSec ?? other.hotIntervalSec
  return hotSec !== undefined ? { ...pick, hotIntervalSec: hotSec } : pick
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

/** Label from `absorbPctOfMaxHpRe` before resolving with wiki HP. */
export const SHIELD_PCT_OF_MAX_HP_LABEL = 'Shield (% of Max HP)' as const

export function isShieldPctOfMaxHpEffect(e: ParsedSupportEffect): boolean {
  return e.label === SHIELD_PCT_OF_MAX_HP_LABEL && e.unit === '%' && e.perLevel === 0
}

/**
 * Turn "% of Max HP" shields into flat HP using the digimon's wiki max HP (support UI + tier heuristics).
 */
export function resolvePctOfMaxHpShields(
  effects: ParsedSupportEffect[],
  maxHp: number | undefined,
): ParsedSupportEffect[] {
  if (maxHp === undefined || !Number.isFinite(maxHp) || maxHp <= 0) return effects
  const hp = maxHp
  return effects.map((e) => {
    if (!isShieldPctOfMaxHpEffect(e)) return e
    const flat = Math.round((e.valueAtLevel / 100) * hp)
    return {
      ...e,
      label: 'Shield',
      base: flat,
      perLevel: 0,
      unit: '' as const,
      valueAtLevel: flat,
    }
  })
}

/** Parsed lines for display and sim: buff text (preferred) + numeric buff fields, deduped. */
export function buildSupportSkillEffects(
  skill: WikiSkill,
  level: number,
  /** Wiki max HP — when set, shields parsed as % of Max HP become flat HP. */
  hostMaxHp?: number,
): ParsedSupportEffect[] {
  const L = Math.max(1, Math.floor(level))
  const fromText = parseSupportEffectsFromSkill(skill, L)
  const fromNums = parseBuffNumericEffects(skill.buff, L)
  const merged = mergeFlatWhenScaledExists(
    filterJunkSupportEffects(dedupeSupportEffectsByStat([...fromText, ...fromNums])),
  )
  return resolvePctOfMaxHpShields(merged, hostMaxHp)
}
