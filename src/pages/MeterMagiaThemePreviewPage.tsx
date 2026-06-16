import { getMeterPartyBarTheme, type MeterPartyBarThemeId } from '../lib/meterPartyBarThemes'
import { buildThemePreviewRows, MeterThemePreview } from '../components/MeterThemePreview'
import { MeterSubNav } from '../components/MeterSubNav'
import { previewDigimonForTheme } from '../lib/meterThemeShop'

const PREVIEW_TAMER = 'Mist'

function MagiaThemePreviewCard({
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
    <section className="meter-cycle-theme-preview-card meter-cycle-theme-preview-card--magia">
      <h2 className="meter-parses-section-title">{title}</h2>
      <p className="meter-parses-muted meter-cycle-theme-preview-sub">{description}</p>
      <MeterThemePreview theme={theme} rows={rows} />
    </section>
  )
}

export function MeterMagiaThemePreviewPage() {
  return (
    <div className="meter-parses-page meter-public-page">
      <header className="meter-parses-logged-head meter-parses-logged-head--bar meter-public-head">
        <h1 className="meter-parses-title">Magia cycle themes</h1>
        <p className="meter-parses-muted">
          Design preview — Magia bar themes with digimon watermark + cycle palette.
        </p>
        <MeterSubNav />
      </header>

      <div className="meter-cycle-theme-preview-grid">
        <MagiaThemePreviewCard
          title="Raguelmon (Rare)"
          description="Fallen-angel violet palette with Raguelmon art as the bar watermark."
          themeId="raguelmon-rare"
          seed={1}
        />
        <MagiaThemePreviewCard
          title="Raguelmon (Legendary)"
          description="Beast-claw X slashes — three marks per diagonal, crossing at the bar center."
          themeId="raguelmon-legendary"
          seed={2}
        />
        <MagiaThemePreviewCard
          title="Plesiomon (Rare)"
          description="Abyssal aqua palette with Plesiomon art as the bar watermark."
          themeId="plesiomon-rare"
          seed={3}
        />
        <MagiaThemePreviewCard
          title="Plesiomon (Legendary)"
          description="Hydro blast — a pressurized jet of water sweeps across the bar on a loop."
          themeId="plesiomon-legendary"
          seed={5}
        />
        <MagiaThemePreviewCard
          title="Zhuqiaomon (Rare)"
          description="Vermillion flame palette with Zhuqiaomon art as the bar watermark."
          themeId="zhuqiaomon-rare"
          seed={4}
        />
        <MagiaThemePreviewCard
          title="Zhuqiaomon (Legendary)"
          description="Phoenix feathers — vermillion plumes drift down gracefully across the fill."
          themeId="zhuqiaomon-legendary"
          seed={6}
        />
      </div>
    </div>
  )
}
