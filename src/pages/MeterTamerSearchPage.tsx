import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { MeterSubNav } from '../components/MeterSubNav'
import {
  canonicalMeterPlayerKey,
  meterPlayerProfilePath,
  normalizeRoutePlayerKey,
} from '../lib/meterPlayerProfile'

export function MeterTamerSearchPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const trimmed = query.trim()
    const rawKey = normalizeRoutePlayerKey(trimmed)
    if (!rawKey) return
    const key = canonicalMeterPlayerKey(rawKey)
    navigate(meterPlayerProfilePath(key), {
      state: rawKey === key ? { displayName: trimmed } : undefined,
    })
  }

  return (
    <div className="meter-parses-page meter-tamer-search-page">
      <header className="meter-parses-logged-head meter-parses-logged-head--bar meter-public-head">
        <h1 className="meter-parses-title">Meter</h1>
        <MeterSubNav />
      </header>

      <section className="meter-tamer-search meter-parses-meter-chrome">
        <h2 className="meter-parses-section-title">Tamer search</h2>
        <p className="meter-tamer-search__hint">
          Enter a tamer name exactly as it appears in meter uploads (character name in party parses).
        </p>
        <form className="meter-tamer-search__form" onSubmit={submit}>
          <label className="meter-tamer-search__field">
            <span className="meter-tamer-search__label">Tamer name</span>
            <input
              type="search"
              className="meter-tamer-search__input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Neptunemon"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <button type="submit" className="guidebook-btn guidebook-btn--ghost" disabled={!query.trim()}>
            View profile
          </button>
        </form>
      </section>
    </div>
  )
}
