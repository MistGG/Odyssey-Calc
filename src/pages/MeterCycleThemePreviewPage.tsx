import {
  getMeterPartyBarTheme,
  HALL_OF_FAME_THEME_ID,
  MAGIA_HALL_OF_FAME_THEME_ID,
} from '../lib/meterPartyBarThemes'
import { buildThemePreviewRows, MeterThemePreview } from '../components/MeterThemePreview'
import { MeterSubNav } from '../components/MeterSubNav'

const OLYMPUS_HOF_COUNT = 7
const MAGIA_HOF_COUNT = 3
const PREVIEW_FILLER_DIGIMON = ['WarGreymon', 'MetalGarurumon', 'Angewomon']
const PREVIEW_TAMER = 'YourTamer'

export function MeterCycleThemePreviewPage() {
  const olympusTheme = getMeterPartyBarTheme(HALL_OF_FAME_THEME_ID)!
  const magiaTheme = getMeterPartyBarTheme(MAGIA_HALL_OF_FAME_THEME_ID)!
  const olympusRows = buildThemePreviewRows(olympusTheme, PREVIEW_TAMER, PREVIEW_FILLER_DIGIMON)
  const magiaRows = buildThemePreviewRows(magiaTheme, PREVIEW_TAMER, PREVIEW_FILLER_DIGIMON)

  return (
    <div className="meter-parses-page meter-public-page">
      <header className="meter-parses-logged-head meter-parses-logged-head--bar meter-public-head">
        <h1 className="meter-parses-title">HoF cycle themes</h1>
        <p className="meter-parses-muted">
          Design preview — Olympus Breaker and Magia Breaker themes with separate cycle badge counts.
        </p>
        <MeterSubNav />
      </header>

      <div className="meter-cycle-theme-preview-grid">
        <section className="meter-cycle-theme-preview-card">
          <h2 className="meter-parses-section-title">Olympus Cycle</h2>
          <p className="meter-parses-muted meter-cycle-theme-preview-sub">
            Olympus Breaker theme · badge count snapshotted at June 15 cutover (example: {OLYMPUS_HOF_COUNT}{' '}
            breaks).
          </p>
          <MeterThemePreview
            theme={olympusTheme}
            rows={olympusRows}
            hofRecordCount={OLYMPUS_HOF_COUNT}
          />
        </section>

        <section className="meter-cycle-theme-preview-card">
          <h2 className="meter-parses-section-title">Magia Cycle</h2>
          <p className="meter-parses-muted meter-cycle-theme-preview-sub">
            Magia Breaker theme · fresh HoF badge count from June 15 5:30 PM Arizona (example: {MAGIA_HOF_COUNT}{' '}
            breaks).
          </p>
          <MeterThemePreview
            theme={magiaTheme}
            rows={magiaRows}
            hofRecordCount={MAGIA_HOF_COUNT}
          />
        </section>
      </div>
    </div>
  )
}
