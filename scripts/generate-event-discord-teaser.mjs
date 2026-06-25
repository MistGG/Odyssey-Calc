/**
 * Discord / social teaser for the community event.
 *
 *   node scripts/generate-event-discord-teaser.mjs
 *
 * Keep EVENT in sync with src/lib/mayClearEvent.ts
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const WIDTH = 1200
const HEIGHT = 675
const ART_WIDTH = 620
const SITE_BG = { r: 3, g: 10, b: 20 }

/** Matches `DigitalWorldBackdrop` in src/index.css */
async function renderDigitalWorldBackdrop() {
  const bgPath = path.join(root, 'public', 'digital-world-bg.png')

  const world = await sharp(bgPath)
    .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'center' })
    .modulate({ brightness: 0.84, saturation: 0.84 })
    .linear(1.05, 0)
    .toBuffer()

  const veilSvg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <radialGradient id="siteVeilRadial" cx="50%" cy="42%" rx="90%" ry="70%">
      <stop offset="0%" stop-color="rgba(3,10,20,0.12)"/>
      <stop offset="100%" stop-color="rgba(2,6,14,0.62)"/>
    </radialGradient>
    <linearGradient id="siteVeilLinear" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(3,8,18,0.38)"/>
      <stop offset="100%" stop-color="rgba(2,5,12,0.72)"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#siteVeilRadial)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#siteVeilLinear)"/>
</svg>`)

  return sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: { ...SITE_BG, alpha: 255 },
    },
  })
    .composite([
      { input: world, blend: 'screen', opacity: 0.4 },
      { input: veilSvg, blend: 'over' },
    ])
    .png()
    .toBuffer()
}

/** @type {const} */
const EVENT = {
  dungeonName: 'Dragon Dimension',
  difficultyLabel: 'Hard',
  eventWindowLabel: 'June 25 – July 3, 2026 UTC',
  prizeCrownsPerRole: 500,
  participationPrizeCrownsPerRole: 250,
  participationShopPointsAll: 25,
  siteLabel: 'odyssey-calc.com/#/event',
}

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function signalBars(x, y) {
  const bars = [1, 1, 1, 1, 0.45, 0.25, 0.15]
  return bars
    .map((h, i) => {
      const barH = 14 * h
      return `<rect x="${x + i * 10}" y="${y - barH}" width="6" height="${barH}" rx="1" fill="rgba(251,191,36,${0.35 + h * 0.45})"/>`
    })
    .join('')
}

function buildOverlaySvg() {
  const dungeon = escapeXml(EVENT.dungeonName.toUpperCase())
  const windowLabel = escapeXml(`${EVENT.difficultyLabel.toUpperCase()} · ${EVENT.eventWindowLabel}`)
  const site = escapeXml(EVENT.siteLabel)

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="shade" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="rgba(3,10,20,0.94)"/>
      <stop offset="52%" stop-color="rgba(3,10,20,0.82)"/>
      <stop offset="72%" stop-color="rgba(3,10,20,0.28)"/>
      <stop offset="100%" stop-color="rgba(3,10,20,0)"/>
    </linearGradient>
    <radialGradient id="ember" cx="82%" cy="72%" r="48%">
      <stop offset="0%" stop-color="rgba(251,146,60,0.42)"/>
      <stop offset="55%" stop-color="rgba(180,83,9,0.12)"/>
      <stop offset="100%" stop-color="transparent"/>
    </radialGradient>
    <radialGradient id="vignette" cx="50%" cy="50%" r="72%">
      <stop offset="55%" stop-color="transparent"/>
      <stop offset="100%" stop-color="rgba(2,6,23,0.72)"/>
    </radialGradient>
    <pattern id="scanlines" patternUnits="userSpaceOnUse" width="4" height="4">
      <rect width="4" height="2" fill="rgba(0,0,0,0.22)"/>
    </pattern>
    <filter id="glow-amber" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#shade)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#ember)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#scanlines)" opacity="0.22"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#vignette)"/>

  <rect x="28" y="24" width="88" height="3" fill="rgba(56,189,248,0.55)"/>
  <rect x="28" y="24" width="3" height="88" fill="rgba(56,189,248,0.55)"/>

  <text x="56" y="58" fill="#67e8f9" font-family="Consolas, &quot;Courier New&quot;, monospace" font-size="13" font-weight="700" letter-spacing="0.18em">ODYSSEY CALC</text>

  <text x="56" y="108" fill="#fbbf24" font-family="Consolas, &quot;Courier New&quot;, monospace" font-size="22" font-weight="700" letter-spacing="0.06em" filter="url(#glow-amber)">▸ INCOMING TRANSMISSION...</text>
  ${signalBars(430, 108)}
  <rect x="56" y="122" width="340" height="2" fill="rgba(251,191,36,0.35)"/>

  <text x="56" y="178" fill="#e2e8f0" font-family="Segoe UI, system-ui, sans-serif" font-size="34" font-weight="600">Looking for the best Tamers</text>
  <text x="56" y="222" fill="#cbd5e1" font-family="Segoe UI, system-ui, sans-serif" font-size="34" font-weight="600">to take on the</text>

  <text x="58" y="286" fill="rgba(248,113,113,0.55)" font-family="Segoe UI, system-ui, sans-serif" font-size="46" font-weight="900" letter-spacing="0.04em">${dungeon}</text>
  <text x="56" y="284" fill="rgba(62,224,255,0.45)" font-family="Segoe UI, system-ui, sans-serif" font-size="46" font-weight="900" letter-spacing="0.04em">${dungeon}</text>
  <text x="56" y="282" fill="#fffbeb" font-family="Segoe UI, system-ui, sans-serif" font-size="46" font-weight="900" letter-spacing="0.04em">${dungeon}</text>

  <rect x="56" y="306" width="292" height="30" rx="15" fill="rgba(180,83,9,0.42)" stroke="rgba(251,191,36,0.38)" stroke-width="1.5"/>
  <text x="72" y="326" fill="#fef3c7" font-family="Segoe UI, system-ui, sans-serif" font-size="14" font-weight="700" letter-spacing="0.04em">${windowLabel}</text>

  <circle cx="64" cy="372" r="5" fill="#fbbf24"/>
  <text x="78" y="378" fill="#fde68a" font-family="Segoe UI, system-ui, sans-serif" font-size="19" font-weight="700">${EVENT.prizeCrownsPerRole} crowns per role · #1 Best DPS</text>

  <circle cx="64" cy="412" r="5" fill="#c4b5fd"/>
  <text x="78" y="418" fill="#ddd6fe" font-family="Segoe UI, system-ui, sans-serif" font-size="19" font-weight="700">${EVENT.participationPrizeCrownsPerRole} crowns per role · random draw</text>

  <circle cx="64" cy="452" r="5" fill="#3ee0ff"/>
  <text x="78" y="458" fill="#a5f3fc" font-family="Segoe UI, system-ui, sans-serif" font-size="19" font-weight="700">${EVENT.participationShopPointsAll} shop points · all eligible uploads</text>

  <text x="56" y="518" fill="#67e8f9" font-family="Consolas, &quot;Courier New&quot;, monospace" font-size="15" font-weight="700" letter-spacing="0.06em">${site}</text>
  <text x="56" y="548" fill="#64748b" font-family="Segoe UI, system-ui, sans-serif" font-size="13" font-weight="600">Community event · unofficial fan site</text>
</svg>`
}

async function main() {
  const artIn = path.join(root, 'public', 'event', 'examon-teaser.jpg')
  const outDir = path.join(root, 'public', 'share', 'event', 'exa-clear')
  const outPng = path.join(outDir, 'discord-teaser.png')
  await fs.mkdir(outDir, { recursive: true })

  const artBuffer = await sharp(artIn)
    .resize(ART_WIDTH, HEIGHT + 56, { fit: 'cover', position: 'right top' })
    .extract({ left: 0, top: 0, width: ART_WIDTH, height: HEIGHT })
    .modulate({ brightness: 1.04, saturation: 1.08 })
    .toBuffer()

  const backdrop = await renderDigitalWorldBackdrop()
  const overlay = Buffer.from(buildOverlaySvg())

  await sharp(backdrop)
    .composite([
      { input: artBuffer, left: WIDTH - ART_WIDTH, top: 0 },
      { input: overlay, left: 0, top: 0 },
    ])
    .png()
    .toFile(outPng)

  console.log(`wrote public/share/event/exa-clear/discord-teaser.png`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
