import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import { Pin } from 'lucide-react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useWhenVisible } from '../../hooks/useWhenVisible'
import { wikiQuestPageUrl } from '../../api/questService'
import {
  getGuidebookDigimonDetailCached,
  getGuidebookDigimonPageCached,
  getGuidebookDungeonDetailCached,
  getGuidebookDungeonsCached,
  getGuidebookItemDetailCached,
  getGuidebookMonsterDetailCached,
  getGuidebookNpcDetailCached,
  getGuidebookNpcPortraitUrl,
  getGuidebookPortraitUrl,
  getGuidebookQuestDetailCached,
  loadGuidebookAllDungeons,
  loadGuidebookDungeonDetail,
  loadGuidebookItemDetail,
  loadGuidebookMonsterDetail,
  loadGuidebookDigimonDetail,
  loadGuidebookDigimonPage,
  loadGuidebookNpcDetail,
  loadGuidebookQuestDetail,
} from '../../lib/guidebookWikiCache'
import { fetchRaidTimer } from '../../api/raidTimerService'
import { digimonPortraitUrl, monsterPortraitUrl, wikiItemIconUrl } from '../../lib/digimonImage'
import { formatRaidQuantity, formatRaidRatePermil } from '../../lib/guidebookItemPanel'
import type { RaidTimerBoss } from '../../types/raidTimerApi'
import type { WikiMonsterDetail } from '../../types/wikiApi'
import {
  GUIDEBOOK_DUNGEON_MEDIA,
  guidebookPublicUrl,
  collectGuidebookDungeonLoot,
  formatGuidebookBossHp,
  guidebookBossFromObjective,
  guidebookDungeonDifficultySlug,
  guidebookGearDropBindTag,
  sortGuidebookDungeonCards,
  wikiDungeonDifficulty,
  type GuidebookDungeonMedia,
} from '../../lib/guidebookDungeonPanel'
import {
  buildRaidSourceDungeonCards,
  buildRaidSourceDungeonCardsForItems,
  type GuidebookRaidSourceDungeonCard,
} from '../../lib/guidebookItemPanel'
import {
  GUIDEBOOK_AGUMON_CLASSIC_ID,
  GUIDEBOOK_DARK_ROAR_DUNGEON_ID,
  GUIDEBOOK_HIKARI_SEES_ODAIBA_QUEST_ID,
  GUIDEBOOK_HOMEOSTASIS_WISH_ITEM_ID,
  GUIDEBOOK_GOGGLES_DATA_ITEM_IDS,
  GUIDEBOOK_KEYRING_DATA_ITEM_IDS,
  GUIDEBOOK_MASTEMON_REPORT_QUEST_ID,
  GUIDEBOOK_NECKLACE_DATA_ITEM_IDS,
  GUIDEBOOK_RING_DATA_ITEM_ID,
  GUIDEBOOK_UNCAP_50_DUNGEON_ID,
  GUIDEBOOK_UNCAP_70_DUNGEON_ID,
  OFFICIAL_BEGINNERS_GUIDE_URL,
  ROLE_GUIDE,
} from '../../lib/guidebookContent'
import { useGuidebook } from './GuidebookContext'
import { useGuidebookWikiOverlay } from './GuidebookWikiOverlay'
import { GuidebookMonsterLink } from './GuidebookWikiOverlayPanels'
import { GuideProse } from './GuidebookUi'
import type {
  WikiDigimonDetail,
  WikiDigimonListItem,
  WikiDungeonDetail,
  WikiDungeonListItem,
  WikiItemDetail,
  WikiNpcDetail,
  WikiNpcQuestRef,
  WikiQuestDetail,
  WikiQuestObjective,
  WikiQuestRequirement,
  WikiQuestReward,
} from '../../types/wikiApi'

function formatInt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function formatQuestReward(reward: WikiQuestReward) {
  const n = typeof reward.value === 'number' ? reward.value : Number(reward.value)
  if (reward.type === 'Bits' || reward.type === 'EXP') {
    return `${reward.type} ${formatInt(Number.isFinite(n) ? n : 0)}`
  }
  return `${reward.type} ${reward.value}`
}

function parseNpcNameParts(name: string) {
  const match = name.match(/^([^<]+)(?:\s*<([^>]+)>\s*)?$/)
  return {
    primary: match?.[1]?.trim() ?? name,
    location: match?.[2]?.trim() ?? null,
  }
}

function isNpcObjective(objective: WikiQuestObjective) {
  return Boolean(objective.target_id) && /npc/i.test(objective.type)
}

function NpcQuestRoleIcon({ role }: { role: string }) {
  if (role === 'turn_in') {
    return <span className="guidebook-npc-quest-row__icon guidebook-npc-quest-row__icon--turn" aria-hidden>✓</span>
  }
  return <span className="guidebook-npc-quest-row__icon guidebook-npc-quest-row__icon--start" aria-hidden>▶</span>
}

function GuidebookNpcProfilePanel({
  npc,
  highlightQuestId,
  onClose,
}: {
  npc: WikiNpcDetail
  highlightQuestId?: string
  onClose?: () => void
}) {
  const { primary, location } = parseNpcNameParts(npc.name)
  const portrait = digimonPortraitUrl(npc.model_id, npc.id, npc.name)

  return (
    <article className="guidebook-npc-panel" aria-label={`${primary} profile`}>
      {onClose ? (
        <button type="button" className="guidebook-npc-panel__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      ) : null}

      <header className="guidebook-npc-panel__hero">
        {portrait ? (
          <img className="guidebook-npc-panel__avatar" src={portrait} alt="" width={64} height={64} />
        ) : (
          <span className="guidebook-npc-panel__avatar guidebook-npc-panel__avatar--placeholder" aria-hidden />
        )}
        <div className="guidebook-npc-panel__identity">
          <h3 className="guidebook-npc-panel__name">
            {primary}
            {location ? <span className="guidebook-npc-panel__name-loc">&lt;{location}&gt;</span> : null}
          </h3>
          <span className="guidebook-npc-panel__type">{npc.type}</span>
        </div>
      </header>

      <section className="guidebook-npc-panel__section">
        <h4 className="guidebook-npc-panel__label">Location</h4>
        <span className="guidebook-npc-panel__map">{npc.map_name}</span>
      </section>

      {npc.quests.length > 0 ? (
        <section className="guidebook-npc-panel__section">
          <h4 className="guidebook-npc-panel__label">Quests ({npc.quests.length})</h4>
          <ul className="guidebook-npc-panel__quests">
            {npc.quests.map((q) => (
              <NpcQuestRow key={q.id} quest={q} highlight={q.id === highlightQuestId} />
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  )
}

function NpcQuestRow({ quest, highlight }: { quest: WikiNpcQuestRef; highlight?: boolean }) {
  return (
    <li className={`guidebook-npc-quest-row${highlight ? ' is-highlight' : ''}`}>
      <NpcQuestRoleIcon role={quest.role} />
      <a
        href={wikiQuestPageUrl(quest.id)}
        target="_blank"
        rel="noreferrer"
        className="guidebook-npc-quest-row__link"
      >
        {quest.name}
      </a>
      <span className="guidebook-npc-quest-row__badge">{quest.type}</span>
    </li>
  )
}

/** Clickable NPC name; hover preview, click opens an interactive panel (wiki-style). */
export function GuidebookNpcHoverLink({
  npcId,
  labelFallback,
  highlightQuestId,
  disableHoverPreview = false,
  onDismissParent,
}: {
  npcId: string
  labelFallback: string
  highlightQuestId?: string
  /** Skip the compact hover card (e.g. inside a quest popover where click opens the full panel). */
  disableHoverPreview?: boolean
  /** Called when this NPC panel closes (e.g. dismiss a pinned quest card that opened it). */
  onDismissParent?: () => void
}) {
  const [npc, setNpc] = useState<WikiNpcDetail | null>(() => getGuidebookNpcDetailCached(npcId))
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [loading, setLoading] = useState(false)

  const ensureNpc = useCallback(() => {
    const cached = getGuidebookNpcDetailCached(npcId)
    if (cached) setNpc(cached)
    setLoading(!cached)
    void loadGuidebookNpcDetail(npcId)
      .then(setNpc)
      .catch(() => {
        if (!getGuidebookNpcDetailCached(npcId)) setNpc(null)
      })
      .finally(() => setLoading(false))
  }, [npcId])

  useEffect(() => {
    void loadGuidebookNpcDetail(npcId).then(setNpc).catch(() => setNpc(null))
  }, [npcId])

  const showHoverPreview = !disableHoverPreview && hover && !pinned
  const labelParts = parseNpcNameParts(npc?.name ?? labelFallback)
  const portrait = getGuidebookNpcPortraitUrl(npcId)

  const closePanel = useCallback(() => {
    setPinned(false)
    setHover(false)
    onDismissParent?.()
  }, [onDismissParent])

  const openPanel = (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setPinned(true)
    ensureNpc()
  }

  useEffect(() => {
    if (!pinned) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') closePanel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pinned, closePanel])

  return (
    <>
      <span
        className="guidebook-npc-mention"
        onMouseEnter={() => {
          if (!disableHoverPreview) setHover(true)
          ensureNpc()
        }}
        onMouseLeave={(e) => {
          if (pinned) return
          const next = e.relatedTarget
          if (next instanceof Node && e.currentTarget.contains(next)) return
          setHover(false)
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="guidebook-prose__npc-trigger"
          aria-expanded={pinned}
          aria-haspopup="dialog"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={openPanel}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') openPanel(e)
          }}
        >
          {portrait ? <img className="guidebook-prose__digimon-icon" src={portrait} alt="" /> : null}
          {labelParts.primary}
        </button>
        {showHoverPreview && loading && !npc ? (
          <div className="guidebook-npc-popover guidebook-npc-popover--loading" role="status">
            Loading NPC…
          </div>
        ) : null}
        {showHoverPreview && npc ? (
          <div className="guidebook-npc-popover guidebook-npc-popover--hover" role="tooltip">
            <GuidebookNpcProfilePanel npc={npc} highlightQuestId={highlightQuestId} />
          </div>
        ) : null}
      </span>

      {pinned && npc
        ? createPortal(
            <div
              className="guidebook-npc-overlay"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) closePanel()
              }}
            >
              <div
              className="guidebook-npc-overlay__dialog guidebook-scroll--themed"
              role="dialog"
              aria-modal="true"
              aria-label={`${labelParts.primary} details`}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <GuidebookNpcProfilePanel
                  npc={npc}
                  highlightQuestId={highlightQuestId}
                  onClose={closePanel}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
      {pinned && loading && !npc
        ? createPortal(
            <div className="guidebook-npc-overlay guidebook-npc-overlay--loading" role="status">
              Loading NPC…
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function pickListMatchByName(candidates: WikiDigimonListItem[], name: string) {
  const lower = name.toLowerCase()
  return (
    candidates.find((d) => d.name.toLowerCase() === lower) ??
    candidates.find((d) => d.name.toLowerCase().startsWith(`${lower}(`)) ??
    candidates[0] ??
    null
  )
}

async function resolveDigimonByName(name: string): Promise<WikiDigimonDetail> {
  const res = await loadGuidebookDigimonPage(0, 30, name)
  const match = pickListMatchByName(res.data, name)
  if (!match) throw new Error('Not found')
  return loadGuidebookDigimonDetail(match.id)
}

function GuidebookDigimonProfilePopover({ detail }: { detail: WikiDigimonDetail }) {
  return (
    <div className="guidebook-profile-popover" aria-hidden>
      <img
        className="guidebook-profile-popover__portrait"
        src={digimonPortraitUrl(detail.model_id, detail.id, detail.name)}
        alt=""
        width={48}
        height={48}
      />
      <div className="guidebook-profile-popover__body">
        <span className="guidebook-profile-popover__name">{detail.name}</span>
        <span className="guidebook-profile-popover__meta">
          {detail.role} · {detail.stage}
        </span>
        <div className="guidebook-profile-popover__stats">
          <span>ATK {formatInt(detail.stats.attack)}</span>
          <span>HP {formatInt(detail.stats.hp)}</span>
        </div>
      </div>
    </div>
  )
}

function QuestPinBadge() {
  return (
    <span className="guidebook-quest-pin" aria-hidden>
      <Pin className="guidebook-quest-pin__icon" size={22} strokeWidth={2.25} aria-hidden />
    </span>
  )
}

function wikiQuestIdFromRequirement(req: WikiQuestRequirement): string | undefined {
  if (req.quest_id?.trim()) return req.quest_id.trim()
  if (typeof req.value === 'string' && req.value.trim()) return req.value.trim()
  return undefined
}

function GuidebookQuestProfilePopover({
  quest,
  pinned = false,
  onDismiss,
}: {
  quest: WikiQuestDetail
  pinned?: boolean
  onDismiss?: () => void
}) {
  const prereq = quest.requirements.find((r) => r.type === 'Complete Quest')
  const prereqQuestId = prereq ? wikiQuestIdFromRequirement(prereq) : undefined
  const npcLinkProps = {
    highlightQuestId: quest.id,
    disableHoverPreview: true as const,
    onDismissParent: onDismiss,
  }

  return (
    <article
      className={`guidebook-quest-popover-card${pinned ? ' is-pinned' : ''}`}
      aria-hidden={pinned ? undefined : true}
    >
      {pinned ? <QuestPinBadge key="pinned" /> : null}
      <header className="guidebook-quest-popover-card__head">
        <span className="guidebook-quest-popover-card__type">{quest.type}</span>
        <span className="guidebook-quest-popover-card__tab">{quest.title_tab}</span>
      </header>

      <h3 className="guidebook-quest-popover-card__title">{quest.title_text}</h3>

      {quest.body_text ? (
        <p className="guidebook-quest-popover-card__body">{quest.body_text}</p>
      ) : null}

      {quest.simple_text && !quest.body_text ? (
        <p className="guidebook-quest-popover-card__simple">{quest.simple_text}</p>
      ) : null}

      {quest.npc_start_id && quest.npc_start ? (
        <section className="guidebook-quest-popover-card__section">
          <h4 className="guidebook-quest-popover-card__label">Quest giver</h4>
          <p className="guidebook-quest-popover-card__npc-line">
            <GuidebookNpcHoverLink
              npcId={quest.npc_start_id}
              labelFallback={parseNpcNameParts(quest.npc_start).primary}
              {...npcLinkProps}
            />
          </p>
        </section>
      ) : null}

      {quest.npc_end_id && quest.npc_end ? (
        <section className="guidebook-quest-popover-card__section">
          <h4 className="guidebook-quest-popover-card__label">Turn in</h4>
          <p className="guidebook-quest-popover-card__npc-line">
            <GuidebookNpcHoverLink
              npcId={quest.npc_end_id}
              labelFallback={parseNpcNameParts(quest.npc_end).primary}
              {...npcLinkProps}
            />
          </p>
        </section>
      ) : null}

      {quest.objectives.length > 0 ? (
        <section className="guidebook-quest-popover-card__section">
          <h4 className="guidebook-quest-popover-card__label">Objectives</h4>
          <ul className="guidebook-quest-popover-card__list">
            {quest.objectives.map((obj, i) => (
              <li key={`${obj.target_id ?? obj.target}-${i}`}>
                <span className="guidebook-quest-popover-card__list-kind">{obj.type}</span>
                <span className="guidebook-quest-popover-card__list-text">
                  {isNpcObjective(obj) && obj.target_id ? (
                    <GuidebookNpcHoverLink
                      npcId={obj.target_id}
                      labelFallback={parseNpcNameParts(obj.target).primary}
                      {...npcLinkProps}
                    />
                  ) : (
                    obj.target
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {quest.rewards.length > 0 ? (
        <section className="guidebook-quest-popover-card__section">
          <h4 className="guidebook-quest-popover-card__label">Rewards</h4>
          <ul className="guidebook-quest-popover-card__rewards">
            {quest.rewards.map((reward, i) => (
              <li key={`${reward.type}-${i}`}>{formatQuestReward(reward)}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {prereq?.name ? (
        <section className="guidebook-quest-popover-card__section guidebook-quest-popover-card__section--req">
          <h4 className="guidebook-quest-popover-card__label">Requires</h4>
          <p className="guidebook-quest-popover-card__req">
            {prereqQuestId ? (
              <a
                href={wikiQuestPageUrl(prereqQuestId)}
                target="_blank"
                rel="noreferrer"
                className="guidebook-quest-popover-card__req-link"
              >
                {prereq.name}
              </a>
            ) : (
              prereq.name
            )}
          </p>
        </section>
      ) : null}
    </article>
  )
}

/** Clickable quest name; hover (or tap) shows a compact quest card from the wiki API. */
export function GuidebookQuestHoverLink({
  questId,
  labelFallback,
  tabLabel,
}: {
  questId: string
  labelFallback: string
  /** Quest tab chip beside the link (e.g. MAIN); falls back to wiki `title_tab` when loaded. */
  tabLabel?: string
}) {
  const [quest, setQuest] = useState<WikiQuestDetail | null>(() =>
    getGuidebookQuestDetailCached(questId),
  )
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [loading, setLoading] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)

  const unpin = useCallback(() => {
    setPinned(false)
    setHover(false)
  }, [])

  useEffect(() => {
    if (!pinned) return
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (rootRef.current?.contains(target)) return
      unpin()
    }
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') unpin()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [pinned, unpin])

  const ensureQuest = useCallback(() => {
    const cached = getGuidebookQuestDetailCached(questId)
    if (cached) setQuest(cached)
    setLoading(!cached)
    void loadGuidebookQuestDetail(questId)
      .then(setQuest)
      .catch(() => {
        if (!getGuidebookQuestDetailCached(questId)) setQuest(null)
      })
      .finally(() => setLoading(false))
  }, [questId])

  useEffect(() => {
    void loadGuidebookQuestDetail(questId)
      .then(setQuest)
      .catch(() => setQuest(null))
  }, [questId])

  const showCard = hover || pinned
  const label = quest?.title_text ?? labelFallback
  const tab = tabLabel ?? quest?.title_tab

  return (
    <span
      ref={rootRef}
      className={`guidebook-quest-mention${pinned ? ' is-pinned' : ''}`}
      onMouseEnter={() => {
        setHover(true)
        ensureQuest()
      }}
      onMouseLeave={(e) => {
        if (pinned) return
        const next = e.relatedTarget
        if (next instanceof Node && e.currentTarget.contains(next)) return
        setHover(false)
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span className="guidebook-quest-mention__label">
        {tab ? <span className="guidebook-quest-popover-card__tab">{tab}</span> : null}
        <button
          type="button"
          className="guidebook-prose__quest-trigger"
          aria-expanded={showCard}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            setPinned((open) => !open)
            ensureQuest()
          }}
        >
          {label}
        </button>
      </span>
      {showCard && quest ? (
        <span
          className="guidebook-quest-popover"
          role="tooltip"
          id={`guidebook-quest-popover-${questId}`}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <GuidebookQuestProfilePopover
            quest={quest}
            pinned={pinned}
            onDismiss={pinned ? unpin : undefined}
          />
        </span>
      ) : null}
      {showCard && loading && !quest ? (
        <span className="guidebook-quest-popover guidebook-quest-popover--loading" role="status">
          Loading quest…
        </span>
      ) : null}
    </span>
  )
}

/** Inline link with icon; hover shows a compact profile card, click opens the Digimon page. */
export function GuidebookDigimonHoverLink({
  digimonId,
  labelFallback = 'Digimon',
}: {
  digimonId: string
  labelFallback?: string
}) {
  const [detail, setDetail] = useState<WikiDigimonDetail | null>(() =>
    getGuidebookDigimonDetailCached(digimonId),
  )
  const [hover, setHover] = useState(false)

  const ensureDetail = useCallback(() => {
    const cached = getGuidebookDigimonDetailCached(digimonId)
    if (cached) setDetail(cached)
    void loadGuidebookDigimonDetail(digimonId)
      .then(setDetail)
      .catch(() => {
        if (!getGuidebookDigimonDetailCached(digimonId)) setDetail(null)
      })
  }, [digimonId])

  useEffect(() => {
    void loadGuidebookDigimonDetail(digimonId)
      .then(setDetail)
      .catch(() => setDetail(null))
  }, [digimonId])

  const label = detail?.name ?? labelFallback
  const portrait =
    getGuidebookPortraitUrl(digimonId) ??
    (detail ? digimonPortraitUrl(detail.model_id, detail.id, detail.name) : undefined)

  return (
    <span
      className="guidebook-digimon-mention"
      onMouseEnter={() => {
        setHover(true)
        ensureDetail()
      }}
      onMouseLeave={() => setHover(false)}
    >
      <Link
        to={`/digimon/${digimonId}`}
        className="guidebook-prose__digimon-trigger"
        aria-describedby={hover && detail ? `guidebook-popover-${digimonId}` : undefined}
        onFocus={() => {
          setHover(true)
          ensureDetail()
        }}
        onBlur={() => setHover(false)}
      >
        {portrait ? <img className="guidebook-prose__digimon-icon" src={portrait} alt="" /> : null}
        {label}
      </Link>
      {hover && detail ? (
        <span
          id={`guidebook-popover-${digimonId}`}
          className="guidebook-digimon-popover"
          role="tooltip"
        >
          <GuidebookDigimonProfilePopover detail={detail} />
        </span>
      ) : null}
    </span>
  )
}

export function GuidebookDigimonProfileCard({
  detail,
  className = '',
}: {
  detail: WikiDigimonDetail
  className?: string
}) {
  return (
    <article
      className={`guidebook-profile-card${className ? ` ${className}` : ''}`}
      aria-label={`${detail.name} profile`}
    >
      <img
        className="guidebook-profile-card__portrait"
        src={digimonPortraitUrl(detail.model_id, detail.id, detail.name)}
        alt=""
        width={72}
        height={72}
      />
      <div className="guidebook-profile-card__body">
        <h3 className="guidebook-profile-card__name">{detail.name}</h3>
        <p className="guidebook-profile-card__meta">
          {detail.role} · {detail.stage} · {detail.attribute} · {detail.element}
        </p>
        <div className="guidebook-profile-card__stats">
          <span>ATK {formatInt(detail.stats.attack)}</span>
          <span>HP {formatInt(detail.stats.hp)}</span>
          <span>CRIT {detail.stats.crit_rate}%</span>
        </div>
        <Link to={`/digimon/${detail.id}`} className="guidebook-btn guidebook-btn--accent guidebook-btn--small">
          Full profile
        </Link>
      </div>
    </article>
  )
}

export function GuidebookDigimonProfileLoader({
  digimonId,
  searchName,
  className = '',
}: {
  digimonId?: string
  searchName?: string
  className?: string
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<WikiDigimonDetail | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const d = digimonId
          ? await loadGuidebookDigimonDetail(digimonId)
          : searchName
            ? await resolveDigimonByName(searchName)
            : null
        if (!d) throw new Error('Missing digimon')
        if (!cancelled) setDetail(d)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load')
          setDetail(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [digimonId, searchName])

  if (loading) return <p className="guidebook-status">Loading…</p>
  if (error) return <p className="guidebook-error">{error}</p>
  if (!detail) return null
  return <GuidebookDigimonProfileCard detail={detail} className={className} />
}

export function GuidebookApiCard({
  title,
  url,
  browseTo,
}: {
  title: string
  url: string
  browseTo?: string
}) {
  const [copied, setCopied] = useState(false)

  return (
    <div className="guidebook-api-row">
      <div className="guidebook-api-row__head">
        <span className="guidebook-api-row__method">GET</span>
        <span className="guidebook-api-row__title">{title}</span>
      </div>
      <div className="guidebook-api-row__actions">
        <button
          type="button"
          className="guidebook-btn guidebook-btn--ghost guidebook-btn--small"
          onClick={() => {
            void copyText(url).then((ok) => {
              if (ok) {
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1400)
              }
            })
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        {browseTo ? (
          <Link className="guidebook-btn guidebook-btn--accent guidebook-btn--small" to={browseTo}>
            Open
          </Link>
        ) : null}
      </div>
    </div>
  )
}

export function GuidebookRoleExplorer() {
  const [role, setRole] = useState('Melee DPS')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<WikiDigimonListItem[]>([])

  const roleMeta = ROLE_GUIDE.find((r) => r.role === role)

  const load = useCallback(async () => {
    const cached = getGuidebookDigimonPageCached(0, 24, undefined, { role })
    if (cached) {
      setItems(cached.data.slice(0, 6))
      setError(null)
      setLoading(false)
    } else {
      setLoading(true)
      setError(null)
    }
    try {
      const res = await loadGuidebookDigimonPage(0, 24, undefined, { role })
      setItems(res.data.slice(0, 6))
      setError(null)
    } catch (e) {
      if (!getGuidebookDigimonPageCached(0, 24, undefined, { role })) {
        setError(e instanceof Error ? e.message : 'Load failed')
        setItems([])
      }
    } finally {
      setLoading(false)
    }
  }, [role])

  useEffect(() => {
    void load()
  }, [load])

  const browseTo = `/?role=${encodeURIComponent(role)}`

  return (
    <>
      <div className="guidebook-chip-row" role="tablist" aria-label="Digimon role">
        {ROLE_GUIDE.map((r) => (
          <button
            key={r.role}
            type="button"
            role="tab"
            aria-selected={role === r.role}
            className={`guidebook-chip${role === r.role ? ' guidebook-chip--active' : ''}`}
            onClick={() => setRole(r.role)}
          >
            {r.role.replace(' DPS', '')}
          </button>
        ))}
      </div>
      {roleMeta ? <p className="guidebook-one-liner">{roleMeta.summary}</p> : null}
      <div className="guidebook-inline-actions">
        <Link className="guidebook-btn guidebook-btn--accent guidebook-btn--small" to={browseTo}>
          Browse {role.replace(' DPS', '')}
        </Link>
      </div>
      {loading ? <p className="guidebook-status">Loading…</p> : null}
      {error ? <p className="guidebook-error">{error}</p> : null}
      {!loading && !error && items.length > 0 ? (
        <ul className="guidebook-digimon-grid">
          {items.map((d) => (
            <li key={d.id}>
              <Link to={`/digimon/${d.id}`} className="guidebook-digimon-card">
                <img
                  src={digimonPortraitUrl(d.model_id, d.id, d.name)}
                  alt=""
                  width={44}
                  height={44}
                  loading="lazy"
                />
                <span className="guidebook-digimon-card__name">{d.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )
}

export function GuidebookDigimonLookup() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<WikiDigimonDetail | null>(null)

  const search = async () => {
    const q = query.trim()
    if (!q) return
    setLoading(true)
    setError(null)
    setDetail(null)
    try {
      const res = await loadGuidebookDigimonPage(0, 20, q)
      const match = pickListMatchByName(res.data, q)
      if (!match) {
        setError('Not found')
        return
      }
      setDetail(await loadGuidebookDigimonDetail(match.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <form
        className="guidebook-search"
        onSubmit={(e) => {
          e.preventDefault()
          void search()
        }}
      >
        <input
          type="search"
          className="guidebook-search__input"
          placeholder="Digimon name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Digimon name"
        />
        <button type="submit" className="guidebook-btn guidebook-btn--accent" disabled={loading}>
          {loading ? '…' : 'Go'}
        </button>
      </form>
      {error ? <p className="guidebook-error">{error}</p> : null}
      {detail ? <GuidebookDigimonProfileCard detail={detail} /> : null}
    </>
  )
}

export function GuidebookDungeonExplorer() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dungeons, setDungeons] = useState<WikiDungeonListItem[]>([])
  const [filter, setFilter] = useState('')

  useEffect(() => {
    let cancelled = false
    const cached = getGuidebookDungeonsCached(500)
    if (cached) {
      setDungeons(cached)
      setLoading(false)
    } else {
      setLoading(true)
    }
    setError(null)
    void loadGuidebookAllDungeons(500)
      .then((all) => {
        if (!cancelled) setDungeons(all)
      })
      .catch((e) => {
        if (!cancelled && !getGuidebookDungeonsCached(500)) {
          setError(e instanceof Error ? e.message : 'Failed')
          setDungeons([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const pool = q ? dungeons.filter((d) => d.name.toLowerCase().includes(q)) : dungeons
    return pool.slice(0, q ? 12 : 9)
  }, [dungeons, filter])

  return (
    <>
      <input
        type="search"
        className="guidebook-search__input"
        placeholder="Filter…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        aria-label="Filter dungeons"
      />
      {loading ? <p className="guidebook-status">Loading…</p> : null}
      {error ? <p className="guidebook-error">{error}</p> : null}
      {!loading && !error ? (
        <div className="guidebook-dungeon-chips">
          {filtered.map((d) => (
            <span key={d.id} className="guidebook-dungeon-chip" title={d.map_name ?? undefined}>
              {d.name}
            </span>
          ))}
        </div>
      ) : null}
      <Link to="/meter" className="guidebook-btn guidebook-btn--ghost guidebook-btn--small">
        Compare on Meter
      </Link>
    </>
  )
}

/** Clickable item; opens the shared wiki overlay (single dialog, stack navigation). */
export function GuidebookItemHoverLink({
  itemId,
  labelFallback,
  iconId,
  hint,
  bindTag,
  variant = 'mention',
}: {
  itemId: string
  labelFallback: string
  iconId?: string
  hint?: string
  /** Shown under the item name (gear dungeon drops). */
  bindTag?: { label: string; tone: 'bound' | 'tradeable' }
  variant?: 'mention' | 'loot-row'
}) {
  const { openItemRoot, pushItem } = useGuidebookWikiOverlay()

  const openPanel = (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (variant === 'loot-row') pushItem(itemId)
    else openItemRoot(itemId)
  }

  const label = labelFallback
  const icon = wikiItemIconUrl(iconId ?? '')

  if (variant === 'loot-row') {
    return (
      <button
        type="button"
        className="guidebook-monster-panel__loot-btn"
        aria-haspopup="dialog"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={openPanel}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') openPanel(e)
        }}
      >
        {icon ? (
          <img className="guidebook-monster-panel__loot-icon" src={icon} alt="" width={20} height={20} />
        ) : null}
        <span className="guidebook-monster-panel__loot-label">{label}</span>
      </button>
    )
  }

  return (
    <span className="guidebook-item-mention" onMouseDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="guidebook-item-mention__trigger"
        aria-haspopup="dialog"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={openPanel}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') openPanel(e)
        }}
      >
        {icon ? (
          <img className="guidebook-item-mention__icon" src={icon} alt="" width={24} height={24} />
        ) : null}
        <span className="guidebook-item-mention__text">
          <span className="guidebook-item-mention__label-row">
            <span className="guidebook-item-mention__label">{label}</span>
            {hint ? <span className="guidebook-item-mention__hint">{hint}</span> : null}
          </span>
          {bindTag ? (
            <span
              className={`guidebook-item-mention__bind-tag guidebook-item-mention__bind-tag--${bindTag.tone}`}
            >
              [{bindTag.label}]
            </span>
          ) : null}
        </span>
      </button>
    </span>
  )
}

const UNCAP_DUNGEON_CARDS = [
  {
    dungeonId: GUIDEBOOK_UNCAP_50_DUNGEON_ID,
    nameFallback: "Agumon's Madness",
    badgeLabel: 'Level 50 uncap',
    difficulty: 'Normal' as const,
  },
  {
    dungeonId: GUIDEBOOK_UNCAP_70_DUNGEON_ID,
    nameFallback: 'The Rise of the Fallen Angel',
    badgeLabel: 'Level 70 uncap',
    difficulty: 'Normal' as const,
  },
] as const

function GuidebookDungeonLocationSlot({ media }: { media: GuidebookDungeonMedia }) {
  const pngSrc = guidebookPublicUrl(`guidebook/uncap-dungeons/${media.locationFilename}`)
  const [src, setSrc] = useState(pngSrc)
  const [missing, setMissing] = useState(false)

  if (missing) {
    return (
      <div className="guidebook-uncap-dungeon-card__location guidebook-uncap-dungeon-card__location--empty">
        <p className="guidebook-uncap-dungeon-card__location-title">Location screenshot</p>
        <p className="guidebook-uncap-dungeon-card__location-hint">
          Add <code>public/guidebook/uncap-dungeons/{media.locationFilename}</code>
        </p>
      </div>
    )
  }

  return (
    <div className="guidebook-uncap-dungeon-card__location">
      <img
        src={src}
        alt={media.locationImageAlt}
        className="guidebook-uncap-dungeon-card__location-img"
        loading="lazy"
        decoding="async"
        onError={() => {
          if (src.endsWith('.png')) {
            setSrc(
              guidebookPublicUrl(
                `guidebook/uncap-dungeons/${media.locationFilename.replace(/\.png$/i, '.webp')}`,
              ),
            )
            return
          }
          setMissing(true)
        }}
      />
    </div>
  )
}

function GuidebookDungeonPanelCard({
  dungeonId,
  nameFallback,
  difficulty,
  badgeLabel,
  highlightLoot,
}: {
  dungeonId: string
  nameFallback: string
  difficulty: string
  badgeLabel?: string
  highlightLoot?: GuidebookRaidSourceDungeonCard['highlightLoot']
}) {
  const { ref, visible } = useWhenVisible<HTMLElement>()
  const media = GUIDEBOOK_DUNGEON_MEDIA[dungeonId]
  const [detail, setDetail] = useState<WikiDungeonDetail | null>(() =>
    getGuidebookDungeonDetailCached(dungeonId),
  )
  const [bossHp, setBossHp] = useState<number | null>(() => {
    const objective = wikiDungeonDifficulty(getGuidebookDungeonDetailCached(dungeonId), difficulty)
      ?.objectives?.[0]
    if (!objective) return null
    return getGuidebookMonsterDetailCached(objective.monster_id)?.hp ?? null
  })

  useEffect(() => {
    if (!visible) return
    void loadGuidebookDungeonDetail(dungeonId)
      .then(setDetail)
      .catch(() => {
        if (!getGuidebookDungeonDetailCached(dungeonId)) setDetail(null)
      })
  }, [dungeonId, visible])

  const diff = wikiDungeonDifficulty(detail, difficulty)
  const objective = diff?.objectives?.[0]

  useEffect(() => {
    if (!visible) return
    const monsterId = objective?.monster_id
    if (!monsterId) {
      setBossHp(null)
      return
    }
    const cached = getGuidebookMonsterDetailCached(monsterId)
    if (cached) setBossHp(cached.hp)
    void loadGuidebookMonsterDetail(monsterId)
      .then((m) => setBossHp(m.hp))
      .catch(() => {
        if (!getGuidebookMonsterDetailCached(monsterId)) setBossHp(null)
      })
  }, [objective?.monster_id, visible])

  const name = detail?.name ?? nameFallback
  const boss = guidebookBossFromObjective(objective, bossHp ?? undefined)
  const dungeonLoot = collectGuidebookDungeonLoot(diff)
  const loot = highlightLoot
    ? (() => {
        const match = dungeonLoot.find((row) => row.itemId === highlightLoot.itemId)
        return [
          match ?? {
            itemId: highlightLoot.itemId,
            name: highlightLoot.name,
            iconId: highlightLoot.iconId,
          },
        ]
      })()
    : dungeonLoot
  const bossHpLabel = formatGuidebookBossHp(boss?.hp)
  const diffSlug = guidebookDungeonDifficultySlug(difficulty)
  const gearBindTag = highlightLoot ? guidebookGearDropBindTag(highlightLoot.itemId) : null

  return (
    <article ref={ref} className="guidebook-uncap-dungeon-card">
      {media ? <GuidebookDungeonLocationSlot media={media} /> : null}

      <div className="guidebook-uncap-dungeon-card__title-block">
        {badgeLabel ? <span className="guidebook-uncap-dungeon-card__uncap">{badgeLabel}</span> : null}
        <div className="guidebook-uncap-dungeon-card__title-row">
          <h4 className="guidebook-uncap-dungeon-card__name">{name}</h4>
          <span className={`guidebook-dungeon-diff guidebook-dungeon-diff--${diffSlug}`}>{difficulty}</span>
        </div>
      </div>

      {boss ? (
        <section className="guidebook-uncap-dungeon-card__section">
          <h5 className="guidebook-uncap-dungeon-card__label">Boss</h5>
          <div className="guidebook-uncap-dungeon-card__boss">
            <img
              className="guidebook-uncap-dungeon-card__boss-portrait"
              src={digimonPortraitUrl(boss.modelId, boss.monsterId, boss.name)}
              alt=""
              width={48}
              height={48}
            />
            <div className="guidebook-uncap-dungeon-card__boss-text">
              <GuidebookMonsterLink
                monsterId={boss.monsterId}
                monsterName={boss.name}
                monsterLevel={boss.level}
                variant="inline"
              />
              {boss.subtitle ? (
                <span className="guidebook-uncap-dungeon-card__boss-sub">{boss.subtitle}</span>
              ) : null}
              <span className="guidebook-uncap-dungeon-card__boss-meta">
                Lv. {boss.level}
                {bossHpLabel ? (
                  <>
                    <span className="guidebook-uncap-dungeon-card__boss-meta-sep" aria-hidden>
                      ·
                    </span>
                    {bossHpLabel}
                  </>
                ) : null}
              </span>
            </div>
          </div>
        </section>
      ) : null}

      {loot.length > 0 ? (
        <section className="guidebook-uncap-dungeon-card__section">
          <h5 className="guidebook-uncap-dungeon-card__label">Loot</h5>
          <ul className="guidebook-uncap-dungeon-card__loot">
            {loot.map((row) => (
              <li
                key={row.itemId}
                className={
                  highlightLoot
                    ? 'guidebook-uncap-dungeon-card__loot-item guidebook-uncap-dungeon-card__loot-item--target'
                    : 'guidebook-uncap-dungeon-card__loot-item'
                }
              >
                {highlightLoot ? (
                  <div className="guidebook-dungeon-target-loot">
                    <GuidebookItemHoverLink
                      itemId={row.itemId}
                      labelFallback={row.name}
                      iconId={row.iconId}
                      hint={highlightLoot.qtyLabel}
                      bindTag={gearBindTag ?? undefined}
                    />
                    <div className="guidebook-dungeon-drop-rate" aria-label="Drop rate">
                      <span className="guidebook-dungeon-drop-rate__value">{highlightLoot.rateLabel}</span>
                      <span className="guidebook-dungeon-drop-rate__label">drop rate</span>
                    </div>
                  </div>
                ) : (
                  <GuidebookItemHoverLink
                    itemId={row.itemId}
                    labelFallback={row.name}
                    iconId={row.iconId}
                    hint={row.hint}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  )
}

export function GuidebookDungeonPanel({
  cards,
  layout = 'pair',
  ariaLabel = 'Dungeons',
}: {
  cards: {
    dungeonId: string
    nameFallback: string
    difficulty: string
    badgeLabel?: string
    highlightLoot?: GuidebookRaidSourceDungeonCard['highlightLoot']
  }[]
  layout?: 'pair' | 'single'
  ariaLabel?: string
}) {
  const sortedCards = useMemo(() => sortGuidebookDungeonCards(cards), [cards])

  return (
    <div
      className={`guidebook-uncap-dungeons${layout === 'single' ? ' guidebook-uncap-dungeons--single' : ''}`}
      aria-label={ariaLabel}
    >
      {sortedCards.map((card) => (
        <GuidebookDungeonPanelCard key={`${card.dungeonId}-${card.difficulty}`} {...card} />
      ))}
    </div>
  )
}

export function GuidebookUncapDungeonPair() {
  return <GuidebookDungeonPanel cards={[...UNCAP_DUNGEON_CARDS]} ariaLabel="Uncap dungeons" />
}

export function GuideEarlyGame5070() {
  return (
    <>
      <GuideProse>
      <p>
        After reaching level 50 for the first time, you will be unable to continue leveling until
        you complete the first level uncap quest. You will be able to obtain this quest after
        completing File Island, specifically the quest{' '}
        <GuidebookQuestHoverLink
          questId={GUIDEBOOK_MASTEMON_REPORT_QUEST_ID}
          labelFallback="Mastemon's Report"
          tabLabel="MAIN"
        />
        .
      </p>
      <p>
        After completing the level 50 uncap, you may continue questing until level 70 and will need
        to uncap again. You will need to continue until the quest in Odaiba called{' '}
        <GuidebookQuestHoverLink
          questId={GUIDEBOOK_HIKARI_SEES_ODAIBA_QUEST_ID}
          labelFallback="Hikari Sees Odaiba"
        />
        .
      </p>
      </GuideProse>
      <GuidebookUncapDungeonPair />
    </>
  )
}

export function GuideEarlyGame70Beyond() {
  return (
    <>
      <GuideProse>
        <p>
          Now that you&apos;ve done that 70 uncap, you can reach 90 before the next cap. You may want
          to start leveling other digimon and the perfect place to do so is the Dark Roar dungeon in
          Big Sight. It gives a large amount of EXP in Story difficulty and can be done very easily
          solo or in a party.
        </p>
      </GuideProse>
      <GuidebookDungeonPanel
        layout="single"
        ariaLabel="Dark Roar"
        cards={[
          {
            dungeonId: GUIDEBOOK_DARK_ROAR_DUNGEON_ID,
            nameFallback: 'The Dark Roar',
            difficulty: 'Story',
          },
        ]}
      />
    </>
  )
}

export function GuideEarlyGame150() {
  return (
    <GuideProse>
      <p>
        Select your favorite digimon or prioritize a role of your choosing. For beginners, you may
        choose between a DPS (Melee, Ranged, Caster), Tank or Healer. There also exists a Hybrid
        role, but is generally for more advanced users. Hybrid does not mean it is better, but
        simply offers more options. If you are uncertain what to pick, you may choose{' '}
        <GuidebookDigimonHoverLink
          digimonId={GUIDEBOOK_AGUMON_CLASSIC_ID}
          labelFallback="Agumon (Classic)"
        />{' '}
        as it has several evolution lines that are useful. In Odyssey, obtaining Digimon is not too
        difficult and you will have many opportunities to get a new Digimon.
      </p>
      <p>
        After making your choice, feel free to play any Tamer you would like. A full tamer list and
        further information is available in the{' '}
        <a href={OFFICIAL_BEGINNERS_GUIDE_URL} target="_blank" rel="noreferrer">
          official beginners guide
        </a>
        . After doing so, please continue the story till the end of File Island.
      </p>
    </GuideProse>
  )
}

export function GuidebookGlossary() {
  const { openDetail } = useGuidebook()
  const terms = [
    { term: 'Role', lines: ['Melee, Ranged, Caster, Hybrid, Tank, or Support.'] },
    { term: 'Sustained', lines: ['DPS over a full skill rotation.'] },
    { term: 'Burst', lines: ['Short window with all cooldowns ready.'] },
    { term: 'Attribute', lines: ['Vaccine, Data, Virus — combat advantage.'] },
    { term: 'Element', lines: ['Fire, Water, etc. — skill typing.'] },
  ]

  return (
    <div className="guidebook-glossary-chips">
      {terms.map((t) => (
        <button
          key={t.term}
          type="button"
          className="guidebook-glossary-chip"
          onClick={() => openDetail({ title: t.term, lines: t.lines })}
        >
          {t.term}
        </button>
      ))}
    </div>
  )
}

type RaidLootChipData = {
  key: string
  itemId: string
  name: string
  iconId?: string
  meta?: string
}

function collectRaidLootChips(monster: WikiMonsterDetail): RaidLootChipData[] {
  const chips: RaidLootChipData[] = []

  for (const drop of monster.drops ?? []) {
    chips.push({
      key: `drop-${drop.item_id}-${drop.drop_type}`,
      itemId: drop.item_id,
      name: drop.item_name,
      iconId: drop.item_icon_id,
      meta: drop.quantity > 1 ? `×${drop.quantity}` : undefined,
    })
  }

  for (const tier of monster.raid_rankings ?? []) {
    for (const reward of tier.rewards ?? []) {
      const min = reward.min ?? 1
      const max = reward.max ?? min
      const metaParts = [formatRaidQuantity(min, max)]
      if (reward.rate_permil != null) metaParts.push(formatRaidRatePermil(reward.rate_permil))
      chips.push({
        key: `rank-${tier.start}-${tier.end}-${reward.item_id}`,
        itemId: reward.item_id,
        name: reward.item_name,
        iconId: reward.item_icon_id,
        meta: metaParts.join(' · '),
      })
    }
  }

  return chips
}

function RaidLootCell({ chip }: { chip: RaidLootChipData }) {
  const { openItemRoot } = useGuidebookWikiOverlay()
  const icon = wikiItemIconUrl(chip.iconId ?? '')
  const title = chip.meta ? `${chip.name} (${chip.meta})` : chip.name

  const openPanel = (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation()
    e.preventDefault()
    openItemRoot(chip.itemId)
  }

  return (
    <button
      type="button"
      className="guidebook-raid-loot-cell"
      title={title}
      aria-label={title}
      aria-haspopup="dialog"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={openPanel}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') openPanel(e)
      }}
    >
      {icon ? <img className="guidebook-raid-loot-cell__icon" src={icon} alt="" /> : null}
      <span className="guidebook-raid-loot-cell__text">
        <span className="guidebook-raid-loot-cell__name">{chip.name}</span>
        {chip.meta ? <span className="guidebook-raid-loot-cell__meta">{chip.meta}</span> : null}
      </span>
    </button>
  )
}

function RaidBossRow({ boss }: { boss: RaidTimerBoss }) {
  const [broken, setBroken] = useState(false)
  const [monster, setMonster] = useState<WikiMonsterDetail | null | undefined>(undefined)
  const src = monsterPortraitUrl(boss.model_id)

  useEffect(() => {
    let cancelled = false
    const cached = getGuidebookMonsterDetailCached(boss.monster_id)
    if (cached) setMonster(cached)

    void loadGuidebookMonsterDetail(boss.monster_id)
      .then((detail) => {
        if (!cancelled) setMonster(detail)
      })
      .catch(() => {
        if (!cancelled) setMonster(null)
      })

    return () => {
      cancelled = true
    }
  }, [boss.monster_id])

  const lootChips = useMemo(
    () => (monster ? collectRaidLootChips(monster) : []),
    [monster],
  )

  const header = (
    <div className="guidebook-raid-card__head">
      <div className="guidebook-raid-card__portrait" aria-hidden>
        {src && !broken ? (
          <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} />
        ) : (
          <span className="guidebook-raid-card__initial">{boss.monster_name.slice(0, 1)}</span>
        )}
      </div>
      <div className="guidebook-raid-card__meta">
        <span className="guidebook-raid-card__name">{boss.monster_name}</span>
        <span className="guidebook-raid-card__map">{boss.map_name}</span>
      </div>
    </div>
  )

  if (monster === undefined) {
    return (
      <li className="guidebook-raid-card--static">
        {header}
        <span className="guidebook-raid-card__badge muted">Loading rewards…</span>
      </li>
    )
  }

  if (lootChips.length === 0) {
    return <li className="guidebook-raid-card--static">{header}</li>
  }

  return (
    <li className="guidebook-raid-card-wrap">
      <details className="guidebook-raid-card">
        <summary className="guidebook-raid-card__summary">
          {header}
          <span className="guidebook-raid-card__badge">
            {lootChips.length} reward{lootChips.length === 1 ? '' : 's'}
          </span>
        </summary>
        <div className="guidebook-raid-card__loot-panel">
          <div className="guidebook-raid-card__loot-grid" role="list" aria-label="Rewards">
            {lootChips.map((chip) => (
              <RaidLootCell key={chip.key} chip={chip} />
            ))}
          </div>
        </div>
      </details>
    </li>
  )
}

export function GuidebookRaids() {
  const { ref, visible } = useWhenVisible<HTMLDivElement>()
  const [bosses, setBosses] = useState<RaidTimerBoss[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    setLoading(true)
    setError(null)

    void fetchRaidTimer()
      .then((data) => {
        if (cancelled) return
        const list = [...(data.bosses ?? [])].sort(
          (a, b) =>
            a.map_name.localeCompare(b.map_name) || a.monster_name.localeCompare(b.monster_name),
        )
        setBosses(list)
      })
      .catch((e) => {
        if (cancelled) return
        setBosses([])
        setError(e instanceof Error ? e.message : 'Failed to load raid bosses')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [visible])

  return (
    <div ref={ref} className="guidebook-raids">
      {loading && bosses.length === 0 ? (
        <p className="guidebook-status">Loading raid bosses…</p>
      ) : null}
      {error ? <p className="guidebook-error">{error}</p> : null}
      {!loading && !error && bosses.length === 0 ? (
        <p className="guidebook-status muted">No raid bosses are listed right now.</p>
      ) : null}
      {bosses.length > 0 ? (
        <ul className="guidebook-raid-list">
          {bosses.map((boss) => (
            <RaidBossRow key={`${boss.monster_id}-${boss.map_id}`} boss={boss} />
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function GuidebookComingSoon() {
  return (
    <GuideProse>
      <p className="guidebook-one-liner muted">Content coming soon.</p>
    </GuideProse>
  )
}

/** Dungeon panels derived from an item&apos;s wiki `raid_sources` (updates when API data changes). */
export function GuidebookItemRaidDungeonPanels({
  itemId,
  ariaLabel = 'Where to obtain',
}: {
  itemId: string
  ariaLabel?: string
}) {
  const { ref, visible } = useWhenVisible<HTMLDivElement>()
  const [cards, setCards] = useState<GuidebookRaidSourceDungeonCard[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    setLoadError(null)
    setLoading(true)
    setCards([])

    const apply = (item: WikiItemDetail) =>
      buildRaidSourceDungeonCards(item)
        .then((built) => {
          if (!cancelled) {
            setCards(built)
            setLoading(false)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setCards([])
            setLoadError('Could not load dungeon data for this item.')
            setLoading(false)
          }
        })

    const cached = getGuidebookItemDetailCached(itemId)
    if (cached) {
      setLoading(false)
      void apply(cached)
    }

    void loadGuidebookItemDetail(itemId)
      .then(apply)
      .catch(() => {
        if (!cancelled && !getGuidebookItemDetailCached(itemId)) {
          setCards([])
          setLoadError('Could not load item data from the wiki.')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [itemId, visible])

  return (
    <div ref={ref} className="guidebook-raid-dungeons">
      {!visible ? null : loading && !loadError ? (
        <p className="guidebook-raid-dungeons__status muted">Loading obtain locations…</p>
      ) : null}
      {visible && loadError ? <p className="guidebook-error">{loadError}</p> : null}
      {visible && !loading && !loadError && !cards.length ? (
        <p className="guidebook-raid-dungeons__status muted">
          No raid dungeon sources are listed for this item yet.
        </p>
      ) : null}
      {visible && !loading && !loadError && cards.length > 0 ? (
        <GuidebookDungeonPanel
          cards={cards}
          layout={cards.length === 1 ? 'single' : 'pair'}
          ariaLabel={ariaLabel}
        />
      ) : null}
    </div>
  )
}

function GuideGearRaidSourcesSection({
  gearLabel,
  itemIds,
}: {
  gearLabel: string
  itemIds: readonly string[]
}) {
  const { ref, visible } = useWhenVisible<HTMLDivElement>()
  const itemIdsKey = itemIds.join(',')
  const [cards, setCards] = useState<GuidebookRaidSourceDungeonCard[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    setLoadError(null)
    setCards([])

    const cachedItems = itemIds
      .map((id) => getGuidebookItemDetailCached(id))
      .filter((item): item is WikiItemDetail => item != null)
    if (cachedItems.length === itemIds.length) {
      setLoading(false)
      void buildRaidSourceDungeonCardsForItems(cachedItems)
        .then((built) => {
          if (!cancelled) setCards(built)
        })
        .catch(() => {
          if (!cancelled) {
            setCards([])
            setLoadError('Could not load dungeon data.')
          }
        })
    } else {
      setLoading(true)
    }

    void Promise.all(itemIds.map((id) => loadGuidebookItemDetail(id)))
      .then((items) => buildRaidSourceDungeonCardsForItems(items))
      .then((built) => {
        if (!cancelled) {
          setCards(built)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled && itemIds.every((id) => !getGuidebookItemDetailCached(id))) {
          setCards([])
          setLoadError('Could not load dungeon data.')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [itemIdsKey, visible])

  return (
    <div ref={ref}>
      <GuideProse>
        <p className="guidebook-wip muted">Work in progress — more {gearLabel} guidance coming soon.</p>
      </GuideProse>
      {!visible ? null : loading && !loadError ? (
        <p className="guidebook-raid-dungeons__status muted">Loading obtain locations…</p>
      ) : null}
      {visible && loadError ? <p className="guidebook-error">{loadError}</p> : null}
      {visible && !loading && !loadError && cards.length > 0 ? (
        <GuidebookDungeonPanel
          cards={cards}
          layout={cards.length === 1 ? 'single' : 'pair'}
          ariaLabel={`${gearLabel} raid dungeons`}
        />
      ) : null}
      {visible && !loading && !loadError && !cards.length ? (
        <p className="guidebook-raid-dungeons__status muted">
          No raid dungeon sources are listed for these items yet.
        </p>
      ) : null}
    </div>
  )
}

export function GuideGearDigivice() {
  return (
    <GuideGearRaidSourcesSection
      gearLabel="digivice"
      itemIds={[GUIDEBOOK_HOMEOSTASIS_WISH_ITEM_ID]}
    />
  )
}

export function GuideGearRing() {
  return <GuideGearRaidSourcesSection gearLabel="ring" itemIds={[GUIDEBOOK_RING_DATA_ITEM_ID]} />
}

export function GuideGearNecklace() {
  return (
    <GuideGearRaidSourcesSection gearLabel="necklace" itemIds={GUIDEBOOK_NECKLACE_DATA_ITEM_IDS} />
  )
}

export function GuideGearKeyring() {
  return (
    <GuideGearRaidSourcesSection gearLabel="keyring" itemIds={GUIDEBOOK_KEYRING_DATA_ITEM_IDS} />
  )
}

export function GuideGearGoggles() {
  return (
    <GuideGearRaidSourcesSection gearLabel="goggles" itemIds={GUIDEBOOK_GOGGLES_DATA_ITEM_IDS} />
  )
}

export function GuideMidGameFarmingDigimon() {
  return <GuidebookComingSoon />
}
