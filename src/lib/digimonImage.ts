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
