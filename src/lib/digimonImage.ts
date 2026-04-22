import type { CSSProperties } from 'react'
import { WIKI_DIGIMON_IMAGE_TEMPLATE, WIKI_SITE_ORIGIN } from '../config/env'

/** Wiki serves model art at `/models/{model_id}l.png` (note the `l` before `.png`). */
export function digimonPortraitUrl(modelId: string, id: string, name: string) {
  const t = WIKI_DIGIMON_IMAGE_TEMPLATE
  if (t) {
    return t
      .replaceAll('{model_id}', modelId)
      .replaceAll('{id}', id)
      .replaceAll('{name}', encodeURIComponent(name))
  }
  if (!modelId?.trim()) return undefined
  return `${WIKI_SITE_ORIGIN}/models/${modelId}l.png`
}

/** Wiki skill icon path (pixel-art style in game UI). */
export function skillIconUrl(iconId: string) {
  if (!iconId?.trim()) return undefined
  return `${WIKI_SITE_ORIGIN}/game_icons/skills/${iconId}.png`
}

/** Rank sprite from /web_assets/digimon_rank.png (32x28 cells on a 160x56 sheet). */
export function rankSpriteStyle(rank: number): CSSProperties {
  const safe = Math.max(1, Math.floor(rank || 1))
  const col = (safe - 1) % 5
  const row = Math.floor((safe - 1) / 5)
  return {
    width: '32px',
    height: '28px',
    overflow: 'hidden',
    display: 'inline-block',
    flexShrink: 0,
    backgroundImage: `url('${WIKI_SITE_ORIGIN}/web_assets/digimon_rank.png')`,
    backgroundPosition: `${-32 * col}px ${-28 * row}px`,
    backgroundSize: '160px 56px',
    backgroundRepeat: 'no-repeat',
  }
}
