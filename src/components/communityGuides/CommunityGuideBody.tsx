import { useEffect, useState, type ReactNode } from 'react'
import { wikiQuestPageUrl } from '../../api/questService'
import { inlineCommunityGuideMarkdown } from '../../lib/communityGuideInlineMarkdown'
import { digimonPortraitUrl, wikiItemIconUrl } from '../../lib/digimonImage'
import {
  getGuidebookDigimonDetailCached,
  loadGuidebookDigimonDetail,
} from '../../lib/guidebookWikiCache'
import { resolveWikiItemByNameOrId } from '../../lib/wikiItemResolve'
import {
  INLINE_EMBED_RE,
  parseDungeonBlockEmbed,
  type CommunityGuideEmbed,
} from '../../lib/communityGuideEmbed'
import { parseCommunityGuideImageMarkdown } from '../../lib/communityGuideImageUrl'
import { parseCommunityGuideTableBlock, mergeCommunityGuideTableChunks } from '../../lib/communityGuideMarkdownTable'
import { GuidebookDungeonPanel } from '../guidebook/GuidebookWidgets'
import { useGuidebookWikiOverlay } from '../guidebook/GuidebookWikiOverlay'
import { CommunityGuideImage } from './CommunityGuideImage'
import { CommunityGuideTableCard } from './CommunityGuideTableCard'

function CommunityGuideItemLink({
  itemRef,
  labelFallback,
}: {
  itemRef: string
  labelFallback: string
}) {
  const { openItemRoot } = useGuidebookWikiOverlay()
  const [resolvedId, setResolvedId] = useState<string | null>(null)
  const [iconId, setIconId] = useState('')
  const [name, setName] = useState(labelFallback)

  useEffect(() => {
    let cancelled = false
    void resolveWikiItemByNameOrId(itemRef, labelFallback)
      .then((item) => {
        if (cancelled || !item) return
        setResolvedId(item.id)
        setIconId(item.icon_id)
        setName(item.name)
      })
      .catch(() => {
        /* keep fallback label */
      })
    return () => {
      cancelled = true
    }
  }, [itemRef, labelFallback])

  const icon = wikiItemIconUrl(iconId)

  return (
    <button
      type="button"
      className="community-guide-item-link"
      disabled={!resolvedId}
      onClick={(e) => {
        e.preventDefault()
        if (resolvedId) openItemRoot(resolvedId)
      }}
    >
      {icon ? (
        <img className="community-guide-item-link__icon" src={icon} alt="" width={16} height={16} />
      ) : (
        <span className="community-guide-item-link__icon-fallback" aria-hidden>
          ·
        </span>
      )}
      <span>{name}</span>
    </button>
  )
}

function CommunityGuideDigimonLink({
  digimonId,
  labelFallback,
}: {
  digimonId: string
  labelFallback: string
}) {
  const { openDigimonRoot } = useGuidebookWikiOverlay()
  const cached = getGuidebookDigimonDetailCached(digimonId)
  const [name, setName] = useState(cached?.name ?? labelFallback)
  const [modelId, setModelId] = useState(cached?.model_id ?? '')

  useEffect(() => {
    void loadGuidebookDigimonDetail(digimonId)
      .then((detail) => {
        setName(detail.name)
        setModelId(detail.model_id)
      })
      .catch(() => {
        /* keep fallback label */
      })
  }, [digimonId])

  const portrait = modelId ? digimonPortraitUrl(modelId, digimonId, name) : undefined

  return (
    <button
      type="button"
      className="community-guide-digimon-link"
      onClick={(e) => {
        e.preventDefault()
        openDigimonRoot(digimonId)
      }}
    >
      {portrait ? (
        <img
          className="community-guide-digimon-link__icon"
          src={portrait}
          alt=""
          width={16}
          height={16}
        />
      ) : (
        <span className="community-guide-digimon-link__icon-fallback" aria-hidden>
          ·
        </span>
      )}
      <span>{name}</span>
    </button>
  )
}

function CommunityGuideQuestLink({
  questId,
  labelFallback,
}: {
  questId: string
  labelFallback: string
}) {
  return (
    <a
      href={wikiQuestPageUrl(questId)}
      target="_blank"
      rel="noreferrer noopener"
      className="community-guide-quest-link"
    >
      {labelFallback}
    </a>
  )
}

function renderInlineEmbed(embed: CommunityGuideEmbed, key: string): ReactNode {
  const label = embed.label ?? embed.id
  switch (embed.kind) {
    case 'item':
      return (
        <CommunityGuideItemLink
          key={key}
          itemRef={embed.label?.trim() || embed.id}
          labelFallback={embed.label?.trim() || embed.id}
        />
      )
    case 'quest':
      return <CommunityGuideQuestLink key={key} questId={embed.id} labelFallback={label} />
    case 'digimon':
      return <CommunityGuideDigimonLink key={key} digimonId={embed.id} labelFallback={label} />
    default:
      return label
  }
}

function renderLineWithEmbeds(line: string, lineKey: string): ReactNode {
  const parts: ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  let i = 0
  const re = new RegExp(INLINE_EMBED_RE.source, 'g')
  while ((match = re.exec(line)) !== null) {
    if (match.index > last) {
      parts.push(...inlineCommunityGuideMarkdown(line.slice(last, match.index), `${lineKey}-t-${i}`))
    }
    parts.push(
      renderInlineEmbed(
        {
          kind: match[1] as 'item' | 'quest' | 'digimon',
          id: match[2]!.trim(),
          label: match[3]?.trim() || undefined,
        },
        `${lineKey}-e-${i}`,
      ),
    )
    last = match.index + match[0].length
    i += 1
  }
  if (last < line.length) {
    parts.push(...inlineCommunityGuideMarkdown(line.slice(last), `${lineKey}-tail`))
  }
  return parts.length === 1 ? parts[0]! : <>{parts}</>
}

function CommunityGuideDungeonBlock({ embed }: { embed: CommunityGuideEmbed }) {
  return (
    <div className="community-guide-dungeon-block">
      <GuidebookDungeonPanel
        layout="single"
        showLocationImage={false}
        ariaLabel={embed.label ?? 'Dungeon'}
        cards={[
          {
            dungeonId: embed.id,
            nameFallback: embed.label ?? 'Dungeon',
            difficulty: embed.difficulty ?? 'Normal',
          },
        ]}
      />
    </div>
  )
}

function renderProseParagraph(lines: string[], key: number): ReactNode {
  return (
    <p key={key} className="community-guide-body__p">
      {lines.map((line, li) => (
        <span key={li}>
          {li > 0 ? <br /> : null}
          {renderLineWithEmbeds(line, `p${key}-l${li}`)}
        </span>
      ))}
    </p>
  )
}

function renderMarkdownChunk(chunk: string, key: number): ReactNode | null {
  const dungeonEmbed = parseDungeonBlockEmbed(chunk)
  if (dungeonEmbed) {
    return <CommunityGuideDungeonBlock key={key} embed={dungeonEmbed} />
  }

  const tableBlock = parseCommunityGuideTableBlock(chunk)
  if (tableBlock) {
    return (
      <CommunityGuideTableCard
        key={key}
        table={tableBlock}
        renderCell={(content, cellKey) => renderLineWithEmbeds(content, cellKey)}
      />
    )
  }

  const lines = chunk.split('\n')
  const trimmed = lines.map((l) => l.trim())
  const nonEmpty = trimmed.filter(Boolean)
  if (!nonEmpty.length) return null

  if (nonEmpty.length === 1 && nonEmpty[0] === '---') {
    return <hr key={key} className="community-guide-md__hr" />
  }

  const first = nonEmpty[0]!
  const imageBlock = parseCommunityGuideImageMarkdown(first)
  if (nonEmpty.length === 1 && imageBlock) {
    return <CommunityGuideImage key={key} src={imageBlock.url} alt={imageBlock.alt} />
  }

  if (nonEmpty.length === 1 && /^##\s+/.test(first)) {
    return (
      <h2 key={key} className="community-guide-md__h2">
        {inlineCommunityGuideMarkdown(first.replace(/^##\s+/, ''), `h2-${key}`)}
      </h2>
    )
  }
  if (nonEmpty.length === 1 && /^###\s+/.test(first)) {
    return (
      <h3 key={key} className="community-guide-md__h3">
        {inlineCommunityGuideMarkdown(first.replace(/^###\s+/, ''), `h3-${key}`)}
      </h3>
    )
  }

  if (nonEmpty.every((l) => /^[-*]\s+/.test(l))) {
    return (
      <ul key={key} className="community-guide-md__list">
        {nonEmpty.map((line, i) => (
          <li key={i}>{renderLineWithEmbeds(line.replace(/^[-*]\s+/, ''), `ul-${key}-${i}`)}</li>
        ))}
      </ul>
    )
  }

  if (nonEmpty.every((l) => /^\d+\.\s+/.test(l))) {
    return (
      <ol key={key} className="community-guide-md__list community-guide-md__list--ordered">
        {nonEmpty.map((line, i) => (
          <li key={i}>
            {renderLineWithEmbeds(line.replace(/^\d+\.\s+/, ''), `ol-${key}-${i}`)}
          </li>
        ))}
      </ol>
    )
  }

  if (nonEmpty.every((l) => /^>\s+/.test(l))) {
    return (
      <blockquote key={key} className="community-guide-md__quote">
        {nonEmpty.map((line, i) => (
          <p key={i}>{renderLineWithEmbeds(line.replace(/^>\s+/, ''), `q-${key}-${i}`)}</p>
        ))}
      </blockquote>
    )
  }

  return renderProseParagraph(lines, key)
}

export function CommunityGuideBody({ body, embedded = false }: { body: string; embedded?: boolean }) {
  const chunks = mergeCommunityGuideTableChunks(
    body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
  )
  const className = [
    'community-guide-body',
    'guidebook-prose',
    'community-guide-md',
    embedded ? 'community-guide-body--embedded' : '',
  ]
    .filter(Boolean)
    .join(' ')

  if (!chunks.length) {
    return <p className="community-guide-body__empty">This guide has no content yet.</p>
  }
  return (
    <div className={className}>
      {chunks.map((chunk, i) => renderMarkdownChunk(chunk, i))}
    </div>
  )
}

export { communityGuideEmbedToken } from '../../lib/communityGuideEmbed'
