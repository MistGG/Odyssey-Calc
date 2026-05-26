/**
 * Static share page + OG image for community event pages (Discord / social crawlers).
 *
 *   node scripts/generate-event-share.mjs
 *
 * Keep EVENTS in sync with src/lib/mayClearEvent.ts
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const BASE_PATH = (process.env.VITE_BASE_PATH !== undefined ? process.env.VITE_BASE_PATH : '/').replace(
  /\/?$/,
  '/',
)
const SITE_ORIGIN = (process.env.VITE_SITE_ORIGIN || 'https://odyssey-calc.com').replace(/\/$/, '')
const SITE_BASE = `${SITE_ORIGIN}${BASE_PATH.startsWith('/') ? BASE_PATH : `/${BASE_PATH}`}`

const OG = { width: 1200, height: 630 }

/** @type {Array<{
 *   id: string
 *   ogSlug: string
 *   eventTitle: string
 *   eventDateLabel: string
 *   difficultyLabel: string
 *   prizeCrownsPerRole: number
 *   roles: { label: string; prize: number }[]
 *   description: string
 *   appHash: string
 * }>} */
const EVENTS = [
  {
    id: 'may-clear',
    ogSlug: 'event-may-clear',
    eventTitle: 'Dungeon Clear Challenge',
    eventDateLabel: 'Thursday, May 29 – June 5, 2026',
    difficultyLabel: 'Hard',
    prizeCrownsPerRole: 200,
    prizeShopPointsPerRole: 100,
    roles: [
      { label: 'Melee', prize: 200 },
      { label: 'Ranged', prize: 200 },
      { label: 'Caster', prize: 200 },
      { label: 'Hybrid', prize: 200 },
      { label: 'Tank', prize: 200 },
      { label: 'Healer', prize: 200 },
    ],
    description:
      'May 29–June 5 community dungeon clear — Hard mode, 200 crowns and 100 meter shop points per role winner (1,200 crowns + 600 shop points total). Odyssey Calc Meter event.',
    appHash: '/#/event',
  },
]

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeXml(text) {
  return escapeHtml(text)
}

function appUrl(event) {
  const base = BASE_PATH === '/' ? '' : BASE_PATH.replace(/\/$/, '')
  return `${base}${event.appHash}`
}

function totalCrowns(event) {
  return event.prizeCrownsPerRole * event.roles.length
}

function shareHtml(event) {
  const shareUrl = `${SITE_BASE}share/event/${event.id}/`
  const ogImage = `${SITE_BASE}og/${event.ogSlug}.png`
  const appLink = appUrl(event)
  const total = totalCrowns(event)

  const prizeList = event.roles
    .map(
      (r) =>
        `<li><strong>${escapeHtml(r.label)}</strong> — ${r.prize.toLocaleString()} crowns + ${event.prizeShopPointsPerRole ?? 0} shop points <span class="muted">(#1 Best DPS)</span></li>`,
    )
    .join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(event.eventTitle)} - Odyssey Calc</title>
  <meta name="description" content="${escapeHtml(event.description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Odyssey Calc" />
  <meta property="og:title" content="${escapeHtml(event.eventTitle)} - Odyssey Calc" />
  <meta property="og:description" content="${escapeHtml(event.description)}" />
  <meta property="og:url" content="${shareUrl}" />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:image:width" content="${OG.width}" />
  <meta property="og:image:height" content="${OG.height}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(event.eventTitle)} - Odyssey Calc" />
  <meta name="twitter:description" content="${escapeHtml(event.description)}" />
  <meta name="twitter:image" content="${ogImage}" />
  <link rel="canonical" href="${shareUrl}" />
  <style>
    body{margin:0;min-height:100vh;font-family:system-ui,sans-serif;background:#030712;color:#e2e8f0;
      background-image:linear-gradient(rgba(56,189,248,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(56,189,248,.03) 1px,transparent 1px);
      background-size:48px 48px}
    .wrap{max-width:42rem;margin:0 auto;padding:28px 20px 40px}
    h1{font-size:1.5rem;margin:0 0 6px;color:#fef3c7}
    .meta{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 16px}
    .pill{padding:4px 12px;border-radius:999px;font-size:.78rem;font-weight:700}
    .pill--date{background:rgba(180,83,9,.45);color:#fef3c7;border:1px solid rgba(251,191,36,.35)}
    .pill--diff{background:rgba(59,130,246,.2);color:#93c5fd;border:1px solid rgba(96,165,250,.4)}
    ul{margin:0;padding-left:1.2rem;line-height:1.65}
    .muted{color:#94a3b8;font-weight:400}
    p.lead{color:#cbd5e1;line-height:1.55}
    a{color:#67e8f9}
  </style>
</head>
<body>
  <div class="wrap">
    <p class="muted" style="margin:0 0 4px;font-size:.75rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Community event</p>
    <h1>${escapeHtml(event.eventTitle)}</h1>
    <div class="meta">
      <span class="pill pill--date">${escapeHtml(event.eventDateLabel)}</span>
      <span class="pill pill--diff">${escapeHtml(event.difficultyLabel)}</span>
    </div>
    <p class="lead"><strong>${total.toLocaleString()} crowns</strong> and <strong>${((event.prizeShopPointsPerRole ?? 0) * event.roles.length).toLocaleString()} meter shop points</strong> across ${event.roles.length} roles — <strong>${event.prizeCrownsPerRole} crowns</strong> and <strong>${event.prizeShopPointsPerRole ?? 0} shop points</strong> per #1 Best DPS.</p>
    <ul>${prizeList}</ul>
    <p class="muted">Opening event page&hellip; <a href="${appLink}">Continue here</a>. Add <code>?stay=1</code> to preview without redirect.</p>
  </div>
  <script>
    if (!/([?&])stay=1(&|$)/.test(location.search)) {
      setTimeout(function () { location.replace(${JSON.stringify(appLink)}); }, 1200);
    }
  </script>
</body>
</html>
`
}

function prizeCardSvg(x, y, w, h, role, prize) {
  const label = escapeXml(role)
  const amount = `${prize} crowns`
  return `<g>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="rgba(15,23,42,.92)" stroke="rgba(251,191,36,.28)" stroke-width="1.5"/>
  <text x="${x + 16}" y="${y + 28}" fill="#fde68a" font-family="Segoe UI, system-ui, sans-serif" font-size="13" font-weight="700">${label.toUpperCase()}</text>
  <text x="${x + 16}" y="${y + 54}" fill="#fbbf24" font-family="Segoe UI, system-ui, sans-serif" font-size="22" font-weight="800">${escapeXml(amount)}</text>
  <text x="${x + 16}" y="${y + 76}" fill="#94a3b8" font-family="Segoe UI, system-ui, sans-serif" font-size="11" font-weight="600">Top parse · Best DPS</text>
</g>`
}

function buildOgSvg(event) {
  const cols = 3
  const gridPad = 44
  const cardW = 352
  const cardH = 88
  const gapX = 14
  const gapY = 12
  const gridW = cols * cardW + (cols - 1) * gapX
  const gridX = (OG.width - gridW) / 2

  const heroX = gridPad
  const heroY = 72
  const heroW = OG.width - gridPad * 2
  const heroH = 112
  const pillGap = 10
  const datePillW = 418
  const diffPillW = 80
  const pillsW = datePillW + pillGap + diffPillW
  const pillsX = (OG.width - pillsW) / 2
  const datePillX = pillsX
  const diffPillX = pillsX + datePillW + pillGap
  const pillY = heroY + 66
  const pillTextY = pillY + 21
  const prizesLabelY = heroY + heroH + 28
  const gridY = prizesLabelY + 22

  const cards = event.roles
    .map((role, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = gridX + col * (cardW + gapX)
      const y = gridY + row * (cardH + gapY)
      return prizeCardSvg(x, y, cardW, cardH, role.label, role.prize)
    })
    .join('\n')

  const title = escapeXml(event.eventTitle)
  const date = escapeXml(event.eventDateLabel)
  const diff = escapeXml(event.difficultyLabel)

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${OG.width}" height="${OG.height}" viewBox="0 0 ${OG.width} ${OG.height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#030712"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="hero" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="rgba(120,53,15,.55)"/>
      <stop offset="45%" stop-color="rgba(15,23,42,.95)"/>
      <stop offset="100%" stop-color="rgba(30,41,59,.85)"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="0%" r="70%">
      <stop offset="0%" stop-color="rgba(251,191,36,.35)"/>
      <stop offset="70%" stop-color="transparent"/>
    </radialGradient>
  </defs>
  <rect width="${OG.width}" height="${OG.height}" fill="url(#bg)"/>
  <g stroke="rgba(56,189,248,0.03)" stroke-width="1">
    ${Array.from({ length: 26 }, (_, i) => {
      const x = i * 48 + 0.5
      return `<line x1="${x}" y1="0" x2="${x}" y2="${OG.height}"/>`
    }).join('')}
    ${Array.from({ length: 14 }, (_, i) => {
      const y = i * 48 + 0.5
      return `<line x1="0" y1="${y}" x2="${OG.width}" y2="${y}"/>`
    }).join('')}
  </g>
  <rect width="${OG.width}" height="${OG.height}" fill="url(#glow)"/>
  <text x="600" y="48" text-anchor="middle" fill="#67e8f9" font-family="Segoe UI, system-ui, sans-serif" font-size="22" font-weight="700" letter-spacing="0.08em">ODYSSEY CALC · COMMUNITY EVENT</text>
  <rect x="${heroX}" y="${heroY}" width="${heroW}" height="${heroH}" rx="16" fill="url(#hero)" stroke="rgba(251,191,36,.4)" stroke-width="2"/>
  <text x="600" y="${heroY + 46}" text-anchor="middle" fill="#fffbeb" font-family="Segoe UI, system-ui, sans-serif" font-size="38" font-weight="800">${title}</text>
  <rect x="${datePillX}" y="${pillY}" width="${datePillW}" height="32" rx="16" fill="rgba(180,83,9,.45)" stroke="rgba(251,191,36,.35)"/>
  <text x="${datePillX + datePillW / 2}" y="${pillTextY}" text-anchor="middle" fill="#fef3c7" font-family="Segoe UI, system-ui, sans-serif" font-size="14" font-weight="700">${date}</text>
  <rect x="${diffPillX}" y="${pillY}" width="${diffPillW}" height="32" rx="16" fill="rgba(59,130,246,.22)" stroke="rgba(96,165,250,.45)"/>
  <text x="${diffPillX + diffPillW / 2}" y="${pillTextY}" text-anchor="middle" fill="#93c5fd" font-family="Segoe UI, system-ui, sans-serif" font-size="14" font-weight="700">${diff}</text>
  <text x="600" y="${prizesLabelY}" text-anchor="middle" fill="#fde68a" font-family="Segoe UI, system-ui, sans-serif" font-size="20" font-weight="700" letter-spacing="0.12em">PRIZES</text>
  ${cards}
</svg>`
}

async function writeOgPng(event) {
  const ogDir = path.join(root, 'public', 'og')
  await fs.mkdir(ogDir, { recursive: true })

  const svg = buildOgSvg(event)
  const svgOut = path.join(ogDir, `${event.ogSlug}.svg`)
  await fs.writeFile(svgOut, svg, 'utf8')
  console.log(`wrote public/og/${event.ogSlug}.svg`)

  let Resvg
  try {
    ;({ Resvg } = await import('@resvg/resvg-js'))
  } catch {
    console.warn('generate-event-share: skip PNG (@resvg/resvg-js missing)')
    return
  }

  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: OG.width } })
  const png = resvg.render().asPng()
  await fs.writeFile(path.join(ogDir, `${event.ogSlug}.png`), png)
  console.log(`wrote public/og/${event.ogSlug}.png`)
}

async function main() {
  for (const event of EVENTS) {
    const dir = path.join(root, 'public', 'share', 'event', event.id)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'index.html'), shareHtml(event), 'utf8')
    console.log(`wrote public/share/event/${event.id}/index.html`)
    await writeOgPng(event)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
