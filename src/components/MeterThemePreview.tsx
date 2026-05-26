import {

  meterPartyBarThemeStyle,

  meterPartyBarThemeBarClassName,

  MIST_DEV_REWARD_THEME_ID,

  meterThemePreviewDigimonLine,

  type MeterPartyBarTheme,

} from '../lib/meterPartyBarThemes'

import { partyMemberBarBackground } from '../lib/meterPartyColor'

import { METER_THEME_PREVIEW_BAR_FILL } from '../lib/meterThemeShop'

import { MeterIliadBarFx } from './MeterIliadBarFx'



export type MeterThemePreviewRow = {

  tamerName: string

  digimonName: string

  fillPct: number

  isSelf?: boolean

}



type MeterThemePreviewProps = {

  theme: MeterPartyBarTheme

  rows: MeterThemePreviewRow[]

  className?: string

}



export function MeterThemePreview({ theme, rows, className = '' }: MeterThemePreviewProps) {

  return (

    <div

      className={`meter-theme-preview meter-parses-meter-chrome${className ? ` ${className}` : ''}`}

      aria-label={`${theme.label} party bar preview`}

    >

      {rows.map((row, index) => {

        const rowKey = `${row.tamerName}-${row.digimonName}-${index}`

        const themed = Boolean(row.isSelf)

        const themeStyle = themed ? meterPartyBarThemeStyle(theme) : undefined

        const sharePct = row.fillPct

        const iliadBar = themed && theme.id === MIST_DEV_REWARD_THEME_ID

        return (

          <div

            key={rowKey}

            className={`meter-party-member${themed ? ' meter-party-member--bar-theme' : ''}`}

            style={themeStyle}

          >

            <div

              className={

                themed ? meterPartyBarThemeBarClassName(theme) : 'meter-party-member-bar'

              }

              style={{

                width: `${Math.min(100, sharePct)}%`,

                ...(iliadBar

                  ? themeStyle

                  : themed

                    ? undefined

                    : { background: partyMemberBarBackground(rowKey) }),

              }}

              aria-hidden

            >

              {iliadBar ? <MeterIliadBarFx /> : null}

            </div>

            <div className="meter-party-member-grid meter-party-member-grid--with-icon">

              <span className="meter-party-name">

                <span className="meter-party-portrait meter-party-portrait--empty" aria-hidden />

                <span className="meter-party-name-stack">

                  <span className="meter-party-name-text">

                    {row.tamerName}

                    {themed ? (

                      <span className="meter-theme-preview-you" aria-label="Your tamer">

                        You

                      </span>

                    ) : null}

                    {themed ? (

                      <span className="meter-party-theme-badge" title={theme.label} aria-hidden>

                        {theme.badge}

                      </span>

                    ) : null}

                  </span>

                  <span className="meter-party-digimon">{row.digimonName}</span>

                </span>

              </span>

              <span className="meter-party-num">-</span>

              <span className="meter-party-num">-</span>

              <span className="meter-party-num">-</span>

            </div>

          </div>

        )

      })}

    </div>

  )

}



const PREVIEW_PARTY_TAMER = 'Party member'



export function buildThemePreviewRows(

  theme: MeterPartyBarTheme,

  confirmedTamerName: string | null,

  fillerDigimon: string[],

): MeterThemePreviewRow[] {

  const [topFill, ...partyFills] = [...METER_THEME_PREVIEW_BAR_FILL].sort((a, b) => b - a)

  const partyRows: MeterThemePreviewRow[] = fillerDigimon.slice(0, 3).map((digimonName, i) => ({

    tamerName: PREVIEW_PARTY_TAMER,

    digimonName,

    fillPct: partyFills[i] ?? partyFills[partyFills.length - 1] ?? 42,

  }))

  const selfName = confirmedTamerName?.trim()

  if (!selfName) return partyRows

  return [

    {

      tamerName: selfName,

      digimonName: meterThemePreviewDigimonLine(theme),

      fillPct: topFill,

      isSelf: true,

    },

    ...partyRows,

  ]

}

