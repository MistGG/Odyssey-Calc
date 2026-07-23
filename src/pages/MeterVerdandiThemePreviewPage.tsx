import { getMeterPartyBarTheme, type MeterPartyBarThemeId } from '../lib/meterPartyBarThemes'
import { buildThemePreviewRows, MeterThemePreview } from '../components/MeterThemePreview'
import { MeterSubNav } from '../components/MeterSubNav'
import { previewDigimonForTheme } from '../lib/meterThemeShop'

const PREVIEW_TAMER = 'Mist'

function VerdandiThemePreviewCard({
  title,
  description,
  themeId,
  seed,
}: {
  title: string
  description: string
  themeId: MeterPartyBarThemeId
  seed: number
}) {
  const theme = getMeterPartyBarTheme(themeId)!
  const rows = buildThemePreviewRows(theme, PREVIEW_TAMER, previewDigimonForTheme(themeId, seed))

  return (
    <section className="meter-cycle-theme-preview-card meter-cycle-theme-preview-card--verdandi">
      <h2 className="meter-parses-section-title">{title}</h2>
      <p className="meter-parses-muted meter-cycle-theme-preview-sub">{description}</p>
      <MeterThemePreview theme={theme} rows={rows} />
    </section>
  )
}

export function MeterVerdandiThemePreviewPage() {
  return (
    <div className="meter-parses-page meter-public-page">
      <header className="meter-parses-logged-head meter-parses-logged-head--bar meter-public-head">
        <h1 className="meter-parses-title">Verdandi cycle themes</h1>
        <p className="meter-parses-muted">
          Design preview — Verdandi bar themes with digimon watermark + cycle palette.
        </p>
        <MeterSubNav />
      </header>

      <div className="meter-cycle-theme-preview-grid">
        <VerdandiThemePreviewCard
          title="Omegamon (Rare)"
          description="White & gold palette with Omegamon art as the bar watermark."
          themeId="omegamon-rare"
          seed={1}
        />
        <VerdandiThemePreviewCard
          title="Omegamon (SSS Legendary)"
          description="Full-width white/gold bar — 1st place outline glow."
          themeId="omegamon-legendary"
          seed={2}
        />
        <VerdandiThemePreviewCard
          title="Ulforce Veemon X (Rare)"
          description="Ulforce blue palette with Ulforce Veemon X art as the bar watermark."
          themeId="ulforce-veemon-x-rare"
          seed={3}
        />
        <VerdandiThemePreviewCard
          title="Ulforce Veemon X (SSS Legendary)"
          description="Full-width Ulforce bar — 1st place blue outline glow."
          themeId="ulforce-veemon-x-legendary"
          seed={5}
        />
        <VerdandiThemePreviewCard
          title="Alphamon Ouryuken (Rare)"
          description="Black & gold Ouryuken palette with Alphamon Ouryuken art as the bar watermark."
          themeId="alphamon-ouryuken-rare"
          seed={4}
        />
        <VerdandiThemePreviewCard
          title="Alphamon Ouryuken (SSS Legendary)"
          description="Full-width black/gold bar — 1st place outline glow."
          themeId="alphamon-ouryuken-legendary"
          seed={6}
        />
      </div>
    </div>
  )
}
