import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { communityGuideCollabColor } from '../lib/communityGuideCollabColors'

export type CommunityGuideRemoteCursor = {
  userId: string
  displayName: string
  color: string
  selectionStart: number
  selectionEnd: number
  focused: boolean
  updatedAt: number
}

type PresenceMeta = {
  userId: string
  displayName: string
  color: string
}

type CursorBroadcast = {
  userId: string
  displayName: string
  color: string
  selectionStart: number
  selectionEnd: number
  focused: boolean
}

const CURSOR_BROADCAST_MS = 160
const CURSOR_STALE_MS = 20_000
const EMPTY_REMOTE_CURSORS: CommunityGuideRemoteCursor[] = []

function channelName(guideId: string): string {
  return `community-guide-editor:${guideId}`
}

function cursorPayloadEqual(
  prev: CommunityGuideRemoteCursor | undefined,
  next: Omit<CommunityGuideRemoteCursor, 'updatedAt'>,
): boolean {
  return Boolean(
    prev &&
      prev.selectionStart === next.selectionStart &&
      prev.selectionEnd === next.selectionEnd &&
      prev.focused === next.focused &&
      prev.displayName === next.displayName &&
      prev.color === next.color,
  )
}

export function useCommunityGuideEditorCursors(options: {
  supabase: SupabaseClient | null
  guideId: string | undefined
  userId: string | null
  displayName: string
  enabled: boolean
}) {
  const { supabase, guideId, userId, displayName, enabled } = options
  const myColor = useMemo(
    () => (userId ? communityGuideCollabColor(userId) : communityGuideCollabColor('local')),
    [userId],
  )

  const [remoteCursors, setRemoteCursors] = useState<CommunityGuideRemoteCursor[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)
  const lastBroadcastRef = useRef(0)
  const pendingRef = useRef<CursorBroadcast | null>(null)
  const flushTimerRef = useRef<number | null>(null)
  const displayNameRef = useRef(displayName)
  const lastSentRef = useRef<CursorBroadcast | null>(null)

  useEffect(() => {
    displayNameRef.current = displayName
  }, [displayName])

  const upsertRemote = useCallback((payload: CursorBroadcast) => {
    if (!userId || payload.userId === userId) return
    setRemoteCursors((prev) => {
      const next: CommunityGuideRemoteCursor = {
        userId: payload.userId,
        displayName: payload.displayName || 'Player',
        color: payload.color || communityGuideCollabColor(payload.userId),
        selectionStart: payload.selectionStart,
        selectionEnd: payload.selectionEnd,
        focused: Boolean(payload.focused),
        updatedAt: Date.now(),
      }
      const idx = prev.findIndex((c) => c.userId === next.userId)
      if (idx === -1) return [...prev, next]
      const existing = prev[idx]
      if (cursorPayloadEqual(existing, next)) {
        // Refresh stale timer without allocating a new array when nothing moved.
        existing.updatedAt = next.updatedAt
        return prev
      }
      const copy = prev.slice()
      copy[idx] = next
      return copy
    })
  }, [userId])

  const removeRemote = useCallback((remoteUserId: string) => {
    setRemoteCursors((prev) => {
      if (!prev.some((c) => c.userId === remoteUserId)) return prev
      return prev.filter((c) => c.userId !== remoteUserId)
    })
  }, [])

  useEffect(() => {
    if (!enabled || !supabase || !guideId || !userId) {
      return
    }

    const meta: PresenceMeta = {
      userId,
      displayName: displayNameRef.current.trim() || 'Player',
      color: myColor,
    }

    const channel = supabase.channel(channelName(guideId), {
      config: {
        presence: { key: userId },
        broadcast: { self: false },
      },
    })

    channel
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        for (const row of leftPresences as unknown as PresenceMeta[]) {
          if (row?.userId) removeRemote(row.userId)
        }
      })
      .on('broadcast', { event: 'cursor' }, ({ payload }) => {
        const data = payload as CursorBroadcast | null
        if (!data?.userId) return
        upsertRemote(data)
      })

    channel.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return
      await channel.track(meta)
    })

    channelRef.current = channel

    const staleTimer = window.setInterval(() => {
      const cutoff = Date.now() - CURSOR_STALE_MS
      setRemoteCursors((prev) => {
        const next = prev.filter((c) => c.updatedAt >= cutoff)
        return next.length === prev.length ? prev : next
      })
    }, 5000)

    return () => {
      window.clearInterval(staleTimer)
      if (flushTimerRef.current != null) {
        window.clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
      lastSentRef.current = null
      channelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [enabled, supabase, guideId, userId, myColor, upsertRemote, removeRemote])

  const flushBroadcast = useCallback(() => {
    flushTimerRef.current = null
    const payload = pendingRef.current
    const channel = channelRef.current
    if (!payload || !channel) return
    pendingRef.current = null

    const last = lastSentRef.current
    if (
      last &&
      last.selectionStart === payload.selectionStart &&
      last.selectionEnd === payload.selectionEnd &&
      last.focused === payload.focused
    ) {
      return
    }

    lastSentRef.current = payload
    lastBroadcastRef.current = Date.now()
    void channel.send({
      type: 'broadcast',
      event: 'cursor',
      payload,
    })
  }, [])

  const publishCursor = useCallback(
    (selectionStart: number, selectionEnd: number, focused: boolean) => {
      if (!enabled || !userId || !channelRef.current) return
      pendingRef.current = {
        userId,
        displayName: displayNameRef.current.trim() || 'Player',
        color: myColor,
        selectionStart,
        selectionEnd,
        focused,
      }
      const elapsed = Date.now() - lastBroadcastRef.current
      if (elapsed >= CURSOR_BROADCAST_MS) {
        if (flushTimerRef.current != null) {
          window.clearTimeout(flushTimerRef.current)
          flushTimerRef.current = null
        }
        flushBroadcast()
        return
      }
      if (flushTimerRef.current == null) {
        flushTimerRef.current = window.setTimeout(
          flushBroadcast,
          CURSOR_BROADCAST_MS - elapsed,
        )
      }
    },
    [enabled, userId, myColor, flushBroadcast],
  )

  return {
    myColor,
    remoteCursors: enabled ? remoteCursors : EMPTY_REMOTE_CURSORS,
    publishCursor,
  }
}
