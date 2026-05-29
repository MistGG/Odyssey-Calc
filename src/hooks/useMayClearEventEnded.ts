import { useEffect, useState } from 'react'
import { MAY_CLEAR_EVENT } from '../lib/mayClearEvent'
import { isMayClearEventEnded } from '../lib/mayClearEventResults'

/** Flips to ended at `eventDateEndIso` (exact timeout + visibility refresh). */
export function useMayClearEventEnded(previewEnded = false): boolean {
  const [ended, setEnded] = useState(() => isMayClearEventEnded(new Date(), previewEnded))

  useEffect(() => {
    if (previewEnded) {
      setEnded(true)
      return
    }

    const sync = () => setEnded(isMayClearEventEnded(new Date(), false))
    sync()

    const endMs = new Date(MAY_CLEAR_EVENT.eventDateEndIso).getTime()
    const delay = endMs - Date.now()
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    if (delay > 0 && delay < 2_147_483_647) {
      timeoutId = setTimeout(sync, delay + 100)
    }

    const intervalId = window.setInterval(sync, 60_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      if (timeoutId != null) window.clearTimeout(timeoutId)
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [previewEnded])

  return ended
}
