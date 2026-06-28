import { useEffect, useMemo, useState } from 'react'
import { fetchWikiItemsPage } from '../../api/itemService'
import { gearStatsPiecesFlat, type GearStatsPiece } from '../../lib/gearStatsReference'
import type { WikiItemListItem } from '../../types/wikiApi'

export type GearStatsIconMap = Record<string, { iconId: string; itemId?: string }>

function buildInitialIconMap(pieces: GearStatsPiece[]): GearStatsIconMap {
  const initial: GearStatsIconMap = {}
  for (const piece of pieces) {
    if (piece.iconId) {
      initial[piece.slug] = { iconId: piece.iconId, itemId: piece.wikiItemId }
    }
  }
  return initial
}

export function useGearStatsWikiIcons(pieces: GearStatsPiece[]): GearStatsIconMap {
  const pieceKey = useMemo(
    () => pieces.map((piece) => `${piece.slug}:${piece.wikiItemName}`).join('|'),
    [pieces],
  )
  const [resolved, setResolved] = useState<GearStatsIconMap>(() => buildInitialIconMap(pieces))

  useEffect(() => {
    setResolved(buildInitialIconMap(pieces))
    const missing = pieces.filter((piece) => !piece.iconId)
    if (!missing.length) return

    let cancelled = false
    void (async () => {
      const next = buildInitialIconMap(pieces)
      for (const piece of missing) {
        try {
          const response = await fetchWikiItemsPage(0, 20, piece.wikiItemName)
          const match: WikiItemListItem | undefined =
            response.data.find((item) => item.name.trim() === piece.wikiItemName.trim()) ??
            response.data[0]
          if (match?.icon_id) {
            next[piece.slug] = { iconId: match.icon_id, itemId: match.id }
          }
        } catch {
          /* ignore per-item lookup failures */
        }
      }
      if (!cancelled) setResolved(next)
    })()

    return () => {
      cancelled = true
    }
  }, [pieceKey, pieces])

  return resolved
}

export function useAllGearStatsWikiIcons(): GearStatsIconMap {
  return useGearStatsWikiIcons(gearStatsPiecesFlat())
}
