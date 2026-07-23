import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  fetchCommunityGuideChangelog,
  type CommunityGuideChangelogEntry,
} from '../../lib/communityGuideChangelog'

function formatChangelogDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

type CommunityGuideChangelogProps = {
  supabase: SupabaseClient
  guideId: string
}

export function CommunityGuideChangelog({ supabase, guideId }: CommunityGuideChangelogProps) {
  const [entries, setEntries] = useState<CommunityGuideChangelogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void fetchCommunityGuideChangelog(supabase, guideId)
      .then((rows) => {
        if (!cancelled) setEntries(rows)
      })
      .catch(() => {
        if (!cancelled) setEntries([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [supabase, guideId])

  if (loading || entries.length === 0) return null

  return (
    <section className="community-guide-changelog" aria-labelledby="guide-changelog-heading">
      <h2 id="guide-changelog-heading" className="community-guide-changelog__title">
        Changelog
      </h2>
      <ol className="community-guide-changelog__list">
        {entries.map((entry) => (
          <li key={entry.id} className="community-guide-changelog__item">
            <div className="community-guide-changelog__meta">
              <time dateTime={entry.created_at}>{formatChangelogDate(entry.created_at)}</time>
              <span className="community-guide-changelog__sep" aria-hidden>
                ·
              </span>
              <span className="community-guide-changelog__editor">{entry.editor_name}</span>
            </div>
            <p className="community-guide-changelog__summary">{entry.summary}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
