import { useEffect, useState } from 'react'
import { loadWikiDungeonsForMeter } from '../lib/wikiDungeons'
import {
  isMayClearEventDungeonAnnounced,
  mayClearEventDungeonFallback,
  resolveMayClearEventDungeon,
  type MayClearEventDungeon,
} from '../lib/mayClearEvent'

export function useMayClearEventDungeon(): MayClearEventDungeon | null {
  const [dungeon, setDungeon] = useState<MayClearEventDungeon | null>(() =>
    mayClearEventDungeonFallback(),
  )

  useEffect(() => {
    if (!isMayClearEventDungeonAnnounced()) {
      setDungeon(null)
      return
    }
    let cancelled = false
    void loadWikiDungeonsForMeter()
      .then((list) => {
        if (!cancelled) setDungeon(resolveMayClearEventDungeon(list))
      })
      .catch(() => {
        if (!cancelled) setDungeon(mayClearEventDungeonFallback())
      })
    return () => {
      cancelled = true
    }
  }, [])

  return dungeon
}
