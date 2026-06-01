/**
 * Static share pages + OG images for guidebook sections (Discord / social crawlers).
 *
 *   node scripts/generate-guidebook-share.mjs
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const UNCAP_DIR = path.join(root, 'public', 'guidebook', 'uncap-dungeons')

const BASE_PATH = (process.env.VITE_BASE_PATH !== undefined ? process.env.VITE_BASE_PATH : '/').replace(
  /\/?$/,
  '/',
)
const SITE_ORIGIN = (
  process.env.VITE_SITE_ORIGIN ||
  process.env.GUIDEBOOK_SHARE_SITE_ORIGIN ||
  'https://odyssey-calc.com'
).replace(/\/$/, '')
const SITE_BASE = `${SITE_ORIGIN}${BASE_PATH.startsWith('/') ? BASE_PATH : `/${BASE_PATH}`}`

const SECTIONS = [
  {
    id: 'early-50-70',
    title: 'Level 50 & 70 uncap',
    ogSubtitle: 'Level 50 and 70 uncap dungeons',
    description:
      "Agumon's Madness and The Rise of the Fallen Angel locations for the level 50 and 70 uncap. Odyssey Calc Guidebook",
    ogSlug: 'guidebook-early-50-70',
    panels: [
      {
        badge: 'Level 50 uncap',
        name: "Agumon's Madness",
        difficulty: 'Normal',
        locationFilename: 'agumons-madness-location.png',
        locationAlt: "Agumon's Madness entrance / map location",
      },
      {
        badge: 'Level 70 uncap',
        name: 'The Rise of the Fallen Angel',
        difficulty: 'Normal',
        locationFilename: 'fallen-angel-location.png',
        locationAlt: 'The Rise of the Fallen Angel entrance / map location',
      },
    ],
  },
  {
    id: 'early-70-beyond',
    title: 'EXP farming',
    ogSubtitle: 'EXP farming: Dark Roar & The Undying',
    description:
      'The Dark Roar and The Undying (Story) for fast EXP after your level 70 uncap. Odyssey Calc Guidebook',
    ogSlug: 'guidebook-early-70-beyond',
    panels: [
      {
        badge: 'EXP farm',
        name: 'The Dark Roar',
        difficulty: 'Story',
        locationFilename: 'dark-roar-location.png',
        locationAlt: 'The Dark Roar entrance / map location (Big Sight)',
      },
      {
        badge: 'EXP farm',
        name: 'The Undying',
        difficulty: 'Story',
        locationFilename: 'the-undying-location.png',
        locationAlt: 'The Undying entrance / map location',
      },
    ],
  },
]

const OG = {
  width: 1200,
  height: 630,
  cardW: 552,
  cardH: 500,
  cardY: 108,
  locH: 360,
  tagY: 392,
  nameY: 448,
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function appHashUrl(sectionId) {
  const base = BASE_PATH === '/' ? '' : BASE_PATH.replace(/\/$/, '')
  return `${base}/#/guidebook?step=${encodeURIComponent(sectionId)}`
}

function locationImgRel(filename) {
  return `../../../guidebook/uncap-dungeons/${filename}`
}

async function resolveLocationFile(filename) {
  const png = path.join(UNCAP_DIR, filename)
  try {
    await fs.access(png)
    return { filePath: png, rel: locationImgRel(filename), mime: 'image/png' }
  } catch {
    /* fall through */
  }
  const webp = path.join(UNCAP_DIR, filename.replace(/\.png$/i, '.webp'))
  try {
    await fs.access(webp)
    return {
      filePath: webp,
      rel: locationImgRel(filename.replace(/\.png$/i, '.webp')),
      mime: 'image/webp',
    }
  } catch {
    return null
  }
}

async function fileToDataUrl(filePath, mime) {
  const buf = await fs.readFile(filePath)
  return `data:${mime};base64,${buf.toString('base64')}`
}

function tagPillHtml(label, tone) {
  if (tone === 'uncap') {
    return `<span style="display:inline-block;padding:4px 10px;border-radius:6px;background:rgba(120,53,15,.9);color:#fde68a;font:700 11px system-ui,sans-serif;letter-spacing:.04em">${escapeHtml(label)}</span>`
  }
  return `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:rgba(59,130,246,.14);color:#93c5fd;border:1px solid rgba(96,165,250,.45);font:700 11px system-ui,sans-serif">${escapeHtml(label)}</span>`
}

function panelPreviewHtml(panel, locationRel) {
  const name = escapeHtml(panel.name)
  const locationBlock = locationRel
    ? `<img src="${locationRel}" alt="${escapeHtml(panel.locationAlt)}" style="display:block;width:100%;aspect-ratio:16/9;object-fit:contain;object-position:center;border-radius:8px;border:1px solid #334155;margin-bottom:12px;background:#0b1220" />`
    : `<div style="aspect-ratio:16/9;border-radius:8px;background:#0b1220;border:1px solid #334155;margin-bottom:12px;display:flex;align-items:center;justify-content:center;color:#64748b;font:600 13px system-ui,sans-serif">Add public/guidebook/uncap-dungeons/${escapeHtml(panel.locationFilename)}</div>`

  return `<article style="flex:1;min-width:280px;max-width:440px;background:linear-gradient(165deg,#1e293b,#0f172a);border:1px solid rgba(148,163,184,.25);border-radius:12px;padding:14px">
  ${locationBlock}
  <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px">${tagPillHtml(panel.badge.toUpperCase(), 'uncap')}${tagPillHtml(panel.difficulty, 'diff')}</div>
  <h2 style="margin:0;font:700 20px system-ui,sans-serif;color:#f8fafc">${name}</h2>
</article>`
}

function shareHtml(section, panelHtmlBlocks) {
  const shareUrl = `${SITE_BASE}share/guidebook/${section.id}/`
  const ogImage = `${SITE_BASE}og/${section.ogSlug}.png`
  const appUrl = appHashUrl(section.id)
  const panels = panelHtmlBlocks.join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(section.title)} - Odyssey Calc Guidebook</title>
  <meta name="description" content="${escapeHtml(section.description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Odyssey Calc" />
  <meta property="og:title" content="${escapeHtml(section.title)} - Odyssey Calc" />
  <meta property="og:description" content="${escapeHtml(section.description)}" />
  <meta property="og:url" content="${shareUrl}" />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:image:width" content="${OG.width}" />
  <meta property="og:image:height" content="${OG.height}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(section.title)} - Odyssey Calc" />
  <meta name="twitter:description" content="${escapeHtml(section.description)}" />
  <meta name="twitter:image" content="${ogImage}" />
  <link rel="canonical" href="${shareUrl}" />
  <style>
    body{margin:0;min-height:100vh;font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0}
    .wrap{max-width:960px;margin:0 auto;padding:28px 20px 40px}
    h1{font-size:1.35rem;margin:0 0 8px}
    p.muted{color:#94a3b8;line-height:1.5}
    .panels{display:flex;flex-wrap:wrap;gap:16px;justify-content:center;margin:20px 0}
    a{color:#67e8f9}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>${escapeHtml(section.title)}</h1>
    <p class="muted">${escapeHtml(section.description)}</p>
    <div class="panels">${panels}</div>
    <p class="muted">Opening guidebook&hellip; <a href="${appUrl}">Continue here</a>. Add <code>?stay=1</code> to preview without redirect.</p>
  </div>
  <script>
    if (!/([?&])stay=1(&|$)/.test(location.search)) {
      setTimeout(function () { location.replace(${JSON.stringify(appUrl)}); }, 1200);
    }
  </script>
</body>
</html>
`
}

function ogCardParts(x, panel, imageDataUrl, clipId) {
  const name = panel.name.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const uncap = panel.badge.toUpperCase()
  const diff = panel.difficulty.toUpperCase()
  const pad = 16
  const locW = OG.cardW - pad * 2
  const locY = OG.cardY + pad
  const imageInner = imageDataUrl
    ? `<image href="${imageDataUrl}" x="${x + pad}" y="${locY}" width="${locW}" height="${OG.locH}" preserveAspectRatio="xMidYMid meet" clip-path="url(#${clipId})"/>`
    : `<text x="${x + OG.cardW / 2}" y="${locY + OG.locH / 2}" text-anchor="middle" fill="#64748b" font-family="Segoe UI, system-ui, sans-serif" font-size="18">Location map</text>`

  const clipDef = `<clipPath id="${clipId}"><rect x="${x + pad}" y="${locY}" width="${locW}" height="${OG.locH}" rx="10"/></clipPath>`

  const body = `<g>
  <rect x="${x}" y="${OG.cardY}" width="${OG.cardW}" height="${OG.cardH}" rx="16" fill="url(#card)" stroke="#475569" stroke-width="2"/>
  <rect x="${x + pad}" y="${locY}" width="${locW}" height="${OG.locH}" rx="10" fill="#0b1220" stroke="#334155"/>
  ${imageInner}
  <rect x="${x + pad}" y="${OG.cardY + OG.tagY}" width="148" height="28" rx="6" fill="#78350f"/>
  <text x="${x + pad + 74}" y="${OG.cardY + OG.tagY + 19}" text-anchor="middle" fill="#fde68a" font-family="Segoe UI, system-ui, sans-serif" font-size="12" font-weight="700">${uncap}</text>
  <rect x="${x + pad + 156}" y="${OG.cardY + OG.tagY}" width="72" height="28" rx="14" fill="rgba(59,130,246,.18)" stroke="rgba(96,165,250,.5)" stroke-width="1"/>
  <text x="${x + pad + 192}" y="${OG.cardY + OG.tagY + 19}" text-anchor="middle" fill="#93c5fd" font-family="Segoe UI, system-ui, sans-serif" font-size="12" font-weight="700">${diff}</text>
  <text x="${x + pad}" y="${OG.cardY + OG.nameY}" fill="#f8fafc" font-family="Segoe UI, system-ui, sans-serif" font-size="24" font-weight="700">${name}</text>
</g>`

  return { clipDef, body }
}

async function buildOgSvg(section) {
  const images = await Promise.all(
    section.panels.map((p) => resolveLocationFile(p.locationFilename)),
  )
  const dataUrls = await Promise.all(
    images.map((img) => (img ? fileToDataUrl(img.filePath, img.mime) : null)),
  )

  const subtitle = escapeHtml(section.ogSubtitle ?? section.title)
  let clipDefs = ''
  let cardBodies = ''

  if (section.panels.length === 1) {
    const x = Math.round((OG.width - OG.cardW) / 2)
    const card = ogCardParts(x, section.panels[0], dataUrls[0], 'clip0')
    clipDefs = card.clipDef
    cardBodies = card.body
  } else {
    const card0 = ogCardParts(36, section.panels[0], dataUrls[0], 'clip0')
    const card1 = ogCardParts(612, section.panels[1], dataUrls[1], 'clip1')
    clipDefs = [card0.clipDef, card1.clipDef].join('\n')
    cardBodies = [card0.body, card1.body].join('\n')
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${OG.width}" height="${OG.height}" viewBox="0 0 ${OG.width} ${OG.height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>
    <linearGradient id="card" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    ${clipDefs}
  </defs>
  <rect width="${OG.width}" height="${OG.height}" fill="url(#bg)"/>
  <text x="600" y="56" text-anchor="middle" fill="#e2e8f0" font-family="Segoe UI, system-ui, sans-serif" font-size="26" font-weight="700" letter-spacing="0.1em">ODYSSEY CALC - GUIDEBOOK</text>
  <text x="600" y="92" text-anchor="middle" fill="#67e8f9" font-family="Segoe UI, system-ui, sans-serif" font-size="20" font-weight="600">${subtitle}</text>
  ${cardBodies}
</svg>`
}

async function writeOgPng(section) {
  const ogDir = path.join(root, 'public', 'og')
  await fs.mkdir(ogDir, { recursive: true })

  const svg = await buildOgSvg(section)
  const svgOut = path.join(ogDir, `${section.ogSlug}.svg`)
  await fs.writeFile(svgOut, svg, 'utf8')
  console.log(`wrote public/og/${section.ogSlug}.svg`)

  let Resvg
  try {
    ;({ Resvg } = await import('@resvg/resvg-js'))
  } catch {
    console.warn('generate-guidebook-share: skip PNG (@resvg/resvg-js missing)')
    return
  }

  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: OG.width } })
  const png = resvg.render().asPng()
  await fs.writeFile(path.join(ogDir, `${section.ogSlug}.png`), png)
  console.log(`wrote public/og/${section.ogSlug}.png`)
}

async function main() {
  for (const section of SECTIONS) {
    const panelHtmlBlocks = []
    for (const panel of section.panels) {
      const loc = await resolveLocationFile(panel.locationFilename)
      panelHtmlBlocks.push(panelPreviewHtml(panel, loc?.rel ?? null))
      if (!loc) {
        console.warn(`generate-guidebook-share: missing ${panel.locationFilename}`)
      }
    }

    const dir = path.join(root, 'public', 'share', 'guidebook', section.id)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'index.html'), shareHtml(section, panelHtmlBlocks), 'utf8')
    console.log(`wrote public/share/guidebook/${section.id}/index.html`)

    await writeOgPng(section)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
