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
const DISCORD_TEASER_OG = { width: 1200, height: 675 }

function ogImageUrl(event) {
  return `${SITE_BASE}share/event/${event.id}/discord-teaser.png`
}

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
    eventDateLabel: 'June 26 – July 3, 2026',
    eventEndUtcLabel: 'July 4, 2026 00:00 UTC',
    difficultyLabel: 'Hard',
    prizeCrownsPerRole: 500,
    prizeShopPointsPerRole: 100,
    participationPrizeCrownsPerRole: 250,
    participationShopPointsAll: 25,
    dungeonAnnounced: true,
    dungeonName: 'Dragon Dimension',
    difficultyId: 3,
    roles: [
      { label: 'Melee', prize: 500 },
      { label: 'Ranged', prize: 500 },
      { label: 'Caster', prize: 500 },
      { label: 'Hybrid', prize: 500 },
      { label: 'Tank', prize: 500 },
      { label: 'Healer', prize: 500 },
    ],
    description:
      'Dragon Dimension Hard clear challenge — June 26 through July 3, 2026 UTC. Uploads before June 26 00:00 UTC do not count. 500 crowns + 100 shop points per role winner, random 250-crown draw per role, 25 shop points for every eligible participant. Odyssey Calc Meter event.',
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

function participationCrownsTotal(event) {
  return (event.participationPrizeCrownsPerRole ?? 0) * event.roles.length
}

function shareHtml(event) {
  const shareUrl = `${SITE_BASE}share/event/${event.id}/`
  const ogImage = ogImageUrl(event)
  const ogWidth = DISCORD_TEASER_OG.width
  const ogHeight = DISCORD_TEASER_OG.height
  const appLink = appUrl(event)
  const total = totalCrowns(event)

  const prizeList = event.roles
    .map(
      (r) =>
        `<li><strong>${escapeHtml(r.label)}</strong>: ${r.prize.toLocaleString()} crowns + ${event.prizeShopPointsPerRole ?? 0} shop points <span class="muted">(#1 Best DPS)</span></li>`,
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
  <meta property="og:image:width" content="${ogWidth}" />
  <meta property="og:image:height" content="${ogHeight}" />
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
    .pill--dungeon{background:rgba(14,116,144,.35);color:#e0f2fe;border:1px solid rgba(56,189,248,.4)}
    .pill--ends{background:rgba(30,64,175,.35);color:#bfdbfe;border:1px solid rgba(96,165,250,.45)}
    ul{margin:0;padding-left:1.2rem;line-height:1.65}
    .muted{color:#94a3b8;font-weight:400}
    p.lead{color:#cbd5e1;line-height:1.55}
    a{color:#67e8f9}
    .how{margin:18px 0 0;padding:0}
    .how h2{margin:0 0 8px;font-size:1rem;color:#fde68a}
    .actions{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0 0}
    .actions a{display:inline-block;padding:8px 14px;border-radius:999px;font-size:.86rem;font-weight:700;text-decoration:none;border:1px solid rgba(103,232,249,.45)}
    .actions a.primary{background:rgba(56,189,248,.15);color:#e0f2fe}
    .actions a.ghost{background:transparent;color:#67e8f9}
    .fan-note{margin:0 0 14px;padding:10px 12px;border-radius:10px;font-size:.82rem;line-height:1.5;color:#cbd5e1;border:1px solid rgba(251,191,36,.35);background:rgba(120,53,15,.22)}
  </style>
</head>
<body>
  <div class="wrap">
    <p class="fan-note"><strong>Unofficial fan site.</strong> Community-run Odyssey Calc event. Not an official in-game promotion from Digital Odyssey.</p>
    <p class="muted" style="margin:0 0 4px;font-size:.75rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Community event · Odyssey Calc</p>
    <h1>${escapeHtml(event.eventTitle)}</h1>
    <div class="meta">
      <span class="pill pill--date">${escapeHtml(event.eventDateLabel)}</span>
      ${event.eventEndUtcLabel ? `<span class="pill pill--ends">Ends ${escapeHtml(event.eventEndUtcLabel)}</span>` : ''}
      ${event.dungeonAnnounced && event.dungeonName ? `<span class="pill pill--dungeon">${escapeHtml(event.dungeonName)}</span>` : ''}
      <span class="pill pill--diff">${escapeHtml(event.difficultyLabel)}</span>
    </div>
    <p class="lead"><strong>${total.toLocaleString()} crowns</strong> and <strong>${((event.prizeShopPointsPerRole ?? 0) * event.roles.length).toLocaleString()} meter shop points</strong> across ${event.roles.length} roles. <strong>${event.prizeCrownsPerRole} crowns</strong> and <strong>${event.prizeShopPointsPerRole ?? 0} shop points</strong> per #1 Best DPS.</p>
    <ul>${prizeList}</ul>
    ${
      event.participationPrizeCrownsPerRole
        ? `<section class="how" aria-labelledby="participation-heading">
      <h2 id="participation-heading">Participation rewards</h2>
      <p class="lead">Random draw: one winner per role for <strong>${event.participationPrizeCrownsPerRole} crowns</strong> each (<strong>${participationCrownsTotal(event).toLocaleString()} crowns</strong> total). Role champions are not eligible for their role&apos;s draw. Everyone with at least one eligible upload earns <strong>${event.participationShopPointsAll ?? 0} meter shop points</strong>.</p>
    </section>`
        : ''
    }
    <section class="how" aria-labelledby="how-heading">
      <h2 id="how-heading">How it works</h2>
      <ol class="muted">
        <li>Run the announced dungeon during the event window on Hard mode.</li>
        <li>Record with Odyssey Companion and upload a dungeon party parse to Meter.</li>
        <li>Top Best DPS per role on the leaderboard wins crowns and meter shop points.</li>
        ${
          event.participationPrizeCrownsPerRole
            ? `<li>Random participation draw: <strong>${event.participationPrizeCrownsPerRole} crowns</strong> per role (role champions excluded); <strong>${event.participationShopPointsAll ?? 0} shop points</strong> for every eligible participant.</li>`
            : ''
        }
      </ol>
    </section>
    <div class="actions">
      <a class="primary" href="${appLink}">Open full event page on Odyssey Calc</a>
      <a class="ghost" href="${BASE_PATH === '/' ? '/#/companion' : `${BASE_PATH.replace(/\/$/, '')}/#/companion`}">About Odyssey Companion</a>
    </div>
  </div>
</body>
</html>
`
}

function prizeCardSvg(x, y, w, h, role, crownPrize, shopPoints) {
  const label = escapeXml(role)
  const crowns = `${crownPrize} crowns`
  const points = `+ ${shopPoints} shop pts`
  return `<g>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="rgba(15,23,42,.92)" stroke="rgba(251,191,36,.28)" stroke-width="1.5"/>
  <text x="${x + 16}" y="${y + 26}" fill="#fde68a" font-family="Segoe UI, system-ui, sans-serif" font-size="13" font-weight="700">${label.toUpperCase()}</text>
  <text x="${x + 16}" y="${y + 50}" fill="#fbbf24" font-family="Segoe UI, system-ui, sans-serif" font-size="20" font-weight="800">${escapeXml(crowns)}</text>
  <text x="${x + 16}" y="${y + 70}" fill="#3ee0ff" font-family="Segoe UI, system-ui, sans-serif" font-size="12" font-weight="700">${escapeXml(points)}</text>
  <text x="${x + 16}" y="${y + 90}" fill="#94a3b8" font-family="Segoe UI, system-ui, sans-serif" font-size="11" font-weight="600">Top parse · Best DPS</text>
</g>`
}

function buildOgSvg(event) {
  const cols = 3
  const gridPad = 44
  const cardW = 352
  const cardH = 102
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
      return prizeCardSvg(x, y, cardW, cardH, role.label, role.prize, event.prizeShopPointsPerRole ?? 0)
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
  <text x="600" y="${prizesLabelY + 18}" text-anchor="middle" fill="#cbd5e1" font-family="Segoe UI, system-ui, sans-serif" font-size="13" font-weight="600">${event.prizeCrownsPerRole} crowns + ${event.prizeShopPointsPerRole ?? 0} shop points per role winner</text>
  ${cards}
  ${
    event.participationPrizeCrownsPerRole
      ? `<text x="600" y="598" text-anchor="middle" fill="#ddd6fe" font-family="Segoe UI, system-ui, sans-serif" font-size="14" font-weight="700">Participation: ${event.participationPrizeCrownsPerRole} crowns/role random draw (${participationCrownsTotal(event)} total) + ${event.participationShopPointsAll ?? 0} shop pts for all eligible uploads</text>`
      : ''
  }
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
