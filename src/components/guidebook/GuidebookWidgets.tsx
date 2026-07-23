import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
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
  guidebookObjectiveForRaidLootCard,
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
  guidebookClothesDigitalDigieggs,
  guidebookClothesDigieggClassLabel,
  guidebookClothesDigieggShortName,
  guidebookClothesExplorerDigieggs,
  type GuidebookClothesDigieggEntry,
} from '../../lib/guidebookClothesDigieggs'
import {
  guidebookSealCategories,
  guidebookSealDungeonEntryFromRow,
  guidebookSealSourcesForItem,
  sortSealDungeonsByLevel,
  type GuidebookSealCategory,
  type GuidebookSealDungeonEntry,
} from '../../lib/guidebookSeals'
import {
  guidebookOdysseySealPackCategories,
  type GuidebookOdysseySealPack,
} from '../../lib/guidebookOdysseySealPacks'
import {
  guidebookDarkMastersTokenDungeonEntryFromRow,
  guidebookDarkMastersTokenSources,
  sortDarkMastersTokenDungeonsByLevel,
} from '../../lib/guidebookDarkMastersToken'
import {
  GUIDEBOOK_AGUMON_CLASSIC_ID,
  GUIDEBOOK_DARK_MASTERS_TOKEN_DARK_DIGICORE_COST,
  GUIDEBOOK_DARK_MASTERS_TOKEN_ENERGIZED_DIGICORE_COST,
  GUIDEBOOK_DARK_MASTERS_TOKEN_ITEM_ID,
  GUIDEBOOK_DARK_ROAR_DUNGEON_ID,
  GUIDEBOOK_UNDYING_EXP_DUNGEON_ID,
  GUIDEBOOK_HIKARI_SEES_ODAIBA_QUEST_ID,
  GUIDEBOOK_DIGIVICE_FRAGMENT_EACH_COUNT,
  GUIDEBOOK_DIGIVICE_FRAGMENTS,
  GUIDEBOOK_DIGIVICE_HOMEOSTASIS_WISH_COUNT,
  GUIDEBOOK_EARRING_DATA_ITEM_IDS,
  GUIDEBOOK_EARLY_EARRING_ROLLS,
  GUIDEBOOK_HOMEOSTASIS_WISH_ITEM_ID,
  GUIDEBOOK_PROMETHEAN_DIGIAURA_HOMEOSTASIS_COUNT,
  GUIDEBOOK_PROMETHEAN_DIGIAURA_MATERIALS,
  GUIDEBOOK_GOGGLES_DATA_ITEM_IDS,
  GUIDEBOOK_GOGGLES_STAT_NOTES,
  GUIDEBOOK_KEYRING_DATA_ITEM_IDS,
  GUIDEBOOK_KEYRING_STAT_NOTES_LEAD,
  GUIDEBOOK_KEYRING_STAT_ROLLS,
  GUIDEBOOK_MASTEMON_REPORT_QUEST_ID,
  GUIDEBOOK_NECKLACE_DATA_ITEM_IDS,
  GUIDEBOOK_RING_ENTRIES,
  GUIDEBOOK_SEAL_EXCHANGE_TICKET_ITEM_ID,
  GUIDEBOOK_EXAMON_SEAL_ITEM_ID,
  GUIDEBOOK_EARLY_NECKLACE_ROLLS,
  GUIDEBOOK_CORRUPTED_GEAR_TRADEABLE_DISCLAIMER,
  GUIDEBOOK_CORRUPTED_CRAFT_MATERIALS,
  GUIDEBOOK_CORRUPTED_ACCESSORY_CRAFT_COUNT,
  GUIDEBOOK_CORRUPTED_RING_DARK_DIGICORE_COUNT,
  GUIDEBOOK_CORRUPTED_RING_ENERGIZED_DIGICORE_COUNT,
  GUIDEBOOK_CORRUPTED_GEAR_GUIDES,
  GUIDEBOOK_CLONE_RECOMMENDATIONS,
  GUIDEBOOK_DARK_DIGICORE_ITEM_ID,
  GUIDEBOOK_DARK_GEAR_GUIDES,
  GUIDEBOOK_DARK_GEAR_TRADEABLE_DISCLAIMER,
  GUIDEBOOK_ENERGIZED_DARK_DIGICORE_ITEM_ID,
  guidebookDarkGearMaterials,
  GUIDEBOOK_PREPARING_APOCALYPSE_DARK_DIGICORE_COUNT,
  GUIDEBOOK_PREPARING_APOCALYPSE_ENERGIZED_DIGICORE_COUNT,
  GUIDEBOOK_PREPARING_APOCALYPSE_QUEST_ID,
  type GuidebookCorruptedCraftMaterial,
  type GuidebookCorruptedGearGuide,
  type GuidebookDarkGearGuide,
  type GuidebookRingEntry,
  GUIDEBOOK_UNCAP_50_DUNGEON_ID,
  GUIDEBOOK_UNCAP_70_DUNGEON_ID,
  OFFICIAL_BEGINNERS_GUIDE_URL,
  ROLE_GUIDE,
} from '../../lib/guidebookContent'
import { useGuidebook } from './GuidebookContext'
import { useGuidebookWikiOverlay } from './GuidebookWikiOverlay'
import { GuidebookMonsterLink } from './GuidebookWikiOverlayPanels'
import { GuideProse, GuidebookGearStatRollPanels, GuidebookNotes, GuidebookPerfectCloneTable } from './GuidebookUi'
import type {
  WikiDigimonDetail,
  WikiDigimonListItem,
  WikiDungeonDetail,
  WikiDungeonListItem,
  WikiItemDetail,
  WikiItemRaidSource,
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

function decodeWikiText(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function formatQuestReward(reward: WikiQuestReward) {
  const n = typeof reward.value === 'number' ? reward.value : Number(reward.value)
  if (reward.type === 'Bits' || reward.type === 'EXP') {
    return `${reward.type} ${formatInt(Number.isFinite(n) ? n : 0)}`
  }
  if (reward.type === 'Item' && reward.item_name?.trim()) {
    const qty = reward.quantity ?? 1
    return `${formatInt(qty)} ${reward.item_name.trim()}`
  }
  return `${reward.type} ${reward.value}`
}

function formatQuestObjectiveTarget(objective: WikiQuestObjective): string {
  return decodeWikiText(objective.target)
}

function parseNpcNameParts(name: string) {
  const decoded = decodeWikiText(name)
  const match = decoded.match(/^([^<]+)(?:\s*<([^>]+)>\s*)?$/)
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
        <p className="guidebook-quest-popover-card__body">{decodeWikiText(quest.body_text)}</p>
      ) : null}

      {quest.simple_text && !quest.body_text ? (
        <p className="guidebook-quest-popover-card__simple">{decodeWikiText(quest.simple_text)}</p>
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
                  {obj.quantity != null && obj.quantity > 0 ? (
                    <span className="guidebook-quest-popover-card__list-qty">{formatInt(obj.quantity)}× </span>
                  ) : null}
                  {isNpcObjective(obj) && obj.target_id ? (
                    <GuidebookNpcHoverLink
                      npcId={obj.target_id}
                      labelFallback={parseNpcNameParts(obj.target).primary}
                      {...npcLinkProps}
                    />
                  ) : (
                    formatQuestObjectiveTarget(obj)
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
              <li key={`${reward.type}-${i}`}>
                {reward.type === 'Item' && reward.item_name?.trim() ? (
                  <span className="guidebook-quest-popover-card__reward-item">
                    {reward.item_icon_id ? (
                      <img
                        className="guidebook-quest-popover-card__reward-icon"
                        src={wikiItemIconUrl(reward.item_icon_id)}
                        alt=""
                        width={20}
                        height={20}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : null}
                    <span>{formatQuestReward(reward)}</span>
                  </span>
                ) : (
                  formatQuestReward(reward)
                )}
              </li>
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

const QUEST_POPOVER_WIDTH_PX = 384
const QUEST_POPOVER_ESTIMATE_HEIGHT_PX = 420

function questPopoverPosition(anchor: HTMLElement, popoverHeight: number) {
  const rect = anchor.getBoundingClientRect()
  const width = Math.min(QUEST_POPOVER_WIDTH_PX, window.innerWidth - 24)
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))
  const gap = 8
  let top = rect.bottom + gap
  if (top + popoverHeight > window.innerHeight - 12) {
    top = Math.max(12, rect.top - gap - popoverHeight)
  }
  return { top, left }
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
  const [popoverCoords, setPopoverCoords] = useState<{ top: number; left: number } | null>(null)
  const rootRef = useRef<HTMLSpanElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const closeTimerRef = useRef<number | null>(null)

  const unpin = useCallback(() => {
    setPinned(false)
    setHover(false)
  }, [])

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const scheduleClose = useCallback(() => {
    if (pinned) return
    clearCloseTimer()
    closeTimerRef.current = window.setTimeout(() => setHover(false), 140)
  }, [clearCloseTimer, pinned])

  const openHover = useCallback(() => {
    clearCloseTimer()
    setHover(true)
  }, [clearCloseTimer])

  const updatePopoverCoords = useCallback(() => {
    const anchor = rootRef.current
    if (!anchor) return
    const height = popoverRef.current?.offsetHeight ?? QUEST_POPOVER_ESTIMATE_HEIGHT_PX
    setPopoverCoords(questPopoverPosition(anchor, height))
  }, [])

  useEffect(() => {
    if (!pinned) return
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (rootRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
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

  useLayoutEffect(() => {
    if (!showCard) {
      setPopoverCoords(null)
      return
    }
    updatePopoverCoords()
    const raf = window.requestAnimationFrame(updatePopoverCoords)
    window.addEventListener('resize', updatePopoverCoords)
    window.addEventListener('scroll', updatePopoverCoords, true)
    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', updatePopoverCoords)
      window.removeEventListener('scroll', updatePopoverCoords, true)
    }
  }, [showCard, quest, loading, updatePopoverCoords])

  const popoverNode =
    showCard && popoverCoords
      ? createPortal(
          <div
            ref={popoverRef}
            className="guidebook-quest-popover guidebook-quest-popover--fixed"
            style={{ top: popoverCoords.top, left: popoverCoords.left }}
            role="tooltip"
            id={`guidebook-quest-popover-${questId}`}
            onMouseEnter={openHover}
            onMouseLeave={scheduleClose}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {quest ? (
              <GuidebookQuestProfilePopover
                quest={quest}
                pinned={pinned}
                onDismiss={pinned ? unpin : undefined}
              />
            ) : (
              <span className="guidebook-quest-popover--loading" role="status">
                Loading quest…
              </span>
            )}
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <span
        ref={rootRef}
        className={`guidebook-quest-mention${pinned ? ' is-pinned' : ''}`}
        onMouseEnter={() => {
          openHover()
          ensureQuest()
        }}
        onMouseLeave={scheduleClose}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className="guidebook-quest-mention__label">
          {tab ? <span className="guidebook-quest-popover-card__tab">{tab}</span> : null}
          <button
            type="button"
            className="guidebook-prose__quest-trigger"
            aria-expanded={showCard}
            aria-controls={showCard ? `guidebook-quest-popover-${questId}` : undefined}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              clearCloseTimer()
              setPinned((open) => {
                const next = !open
                setHover(next)
                return next
              })
              ensureQuest()
            }}
          >
            {label}
          </button>
        </span>
      </span>
      {popoverNode}
    </>
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
    difficulty: 'Story' as const,
  },
  {
    dungeonId: GUIDEBOOK_UNCAP_70_DUNGEON_ID,
    nameFallback: 'The Rise of the Fallen Angel',
    badgeLabel: 'Level 70 uncap',
    difficulty: 'Story' as const,
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
  bossId,
  highlightLoot,
  showLocationImage = true,
}: {
  dungeonId: string
  nameFallback: string
  difficulty: string
  badgeLabel?: string
  bossId?: string
  highlightLoot?: GuidebookRaidSourceDungeonCard['highlightLoot']
  showLocationImage?: boolean
}) {
  const { ref, visible } = useWhenVisible<HTMLElement>()
  const media = GUIDEBOOK_DUNGEON_MEDIA[dungeonId]
  const [detail, setDetail] = useState<WikiDungeonDetail | null>(() =>
    getGuidebookDungeonDetailCached(dungeonId),
  )

  useEffect(() => {
    if (!visible) return
    void loadGuidebookDungeonDetail(dungeonId)
      .then(setDetail)
      .catch(() => {
        if (!getGuidebookDungeonDetailCached(dungeonId)) setDetail(null)
      })
  }, [dungeonId, visible])

  const diff = wikiDungeonDifficulty(detail, difficulty)
  const objective = guidebookObjectiveForRaidLootCard(
    diff,
    highlightLoot?.itemId,
    bossId,
  )

  const [bossHp, setBossHp] = useState<number | null>(() => {
    if (!objective) return null
    return getGuidebookMonsterDetailCached(objective.monster_id)?.hp ?? null
  })

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
      {showLocationImage && media ? <GuidebookDungeonLocationSlot media={media} /> : null}

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
  showLocationImage = true,
}: {
  cards: {
    dungeonId: string
    nameFallback: string
    difficulty: string
    badgeLabel?: string
    bossId?: string
    dropRatePermil?: number
    highlightLoot?: GuidebookRaidSourceDungeonCard['highlightLoot']
  }[]
  layout?: 'pair' | 'single'
  ariaLabel?: string
  showLocationImage?: boolean
}) {
  const sortedCards = useMemo(() => sortGuidebookDungeonCards(cards), [cards])

  return (
    <div
      className={`guidebook-uncap-dungeons${layout === 'single' ? ' guidebook-uncap-dungeons--single' : ''}`}
      aria-label={ariaLabel}
    >
      {sortedCards.map((card) => (
        <GuidebookDungeonPanelCard
          key={`${card.dungeonId}-${card.difficulty}`}
          {...card}
          showLocationImage={showLocationImage}
        />
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
      <GuidebookNotes ariaLabel="Level 50 and 70 uncap">
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
      </GuidebookNotes>
      <GuidebookUncapDungeonPair />
    </>
  )
}

export function GuideEarlyGame70Beyond() {
  return (
    <>
      <GuidebookNotes ariaLabel="EXP farming">
        <GuideProse>
          <p>
            Now that you&apos;ve done that 70 uncap, you can reach 90 before the next cap. You may want
            to start leveling other digimon and the perfect place to do so is the Dark Roar dungeon in
            Big Sight. It gives a large amount of EXP in Story difficulty and can be done very easily
            solo or in a party. You can also run VenomVamdemon in The Undying Story Mode for EXP, solo or in
            a party. You can find this in Odaiba.
          </p>
        </GuideProse>
      </GuidebookNotes>
      <GuidebookDungeonPanel
        ariaLabel="EXP farming dungeons"
        cards={[
          {
            dungeonId: GUIDEBOOK_DARK_ROAR_DUNGEON_ID,
            nameFallback: 'The Dark Roar',
            difficulty: 'Story',
            badgeLabel: 'EXP farm',
          },
          {
            dungeonId: GUIDEBOOK_UNDYING_EXP_DUNGEON_ID,
            nameFallback: 'The Undying',
            difficulty: 'Story',
            badgeLabel: 'EXP farm',
          },
        ]}
      />
    </>
  )
}

export function GuideEarlyGame150() {
  return (
    <GuidebookNotes ariaLabel="Choosing your partner">
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
    </GuidebookNotes>
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

export function GuidebookClones() {
  return (
    <div className="guidebook-clones">
      <GuidebookGearStatRollPanels
        rolls={GUIDEBOOK_CLONE_RECOMMENDATIONS}
        ariaLabel="Clone recommendations"
        sectionTitle="Clone Recommendations"
      />
      <GuidebookPerfectCloneTable />
    </div>
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
  showWip = true,
  dungeonAriaLabel,
  dungeonEmptyMessage,
}: {
  gearLabel: string
  itemIds: readonly string[]
  showWip?: boolean
  dungeonAriaLabel?: string
  dungeonEmptyMessage?: string
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

  const dungeonsLabel = dungeonAriaLabel ?? `${gearLabel} material dungeons`
  const emptyLabel =
    dungeonEmptyMessage ?? `No dungeon sources are listed for these materials yet.`

  return (
    <div ref={ref} className="guidebook-gear-dungeons">
      {showWip ? (
        <GuideProse>
          <p className="guidebook-wip muted">Work in progress; more {gearLabel} guidance coming soon.</p>
        </GuideProse>
      ) : null}
      {!visible ? null : loading && !loadError ? (
        <p className="guidebook-raid-dungeons__status muted">Loading obtain locations…</p>
      ) : null}
      {visible && loadError ? <p className="guidebook-error">{loadError}</p> : null}
      {visible && !loading && !loadError && cards.length > 0 ? (
        <GuidebookDungeonPanel
          cards={cards}
          layout={cards.length === 1 ? 'single' : 'pair'}
          ariaLabel={dungeonsLabel}
        />
      ) : null}
      {visible && !loading && !loadError && !cards.length ? (
        <p className="guidebook-raid-dungeons__status muted">{emptyLabel}</p>
      ) : null}
    </div>
  )
}

function GuidebookMaterialRequirement({
  itemId,
  quantity,
  labelFallback,
  note,
}: {
  itemId: string
  quantity: number
  labelFallback: string
  note?: string
}) {
  const { ref, visible } = useWhenVisible<HTMLDivElement>()
  const { openItemRoot } = useGuidebookWikiOverlay()
  const [item, setItem] = useState<WikiItemDetail | null>(() => getGuidebookItemDetailCached(itemId) ?? null)

  useEffect(() => {
    if (!visible) return
    const cached = getGuidebookItemDetailCached(itemId)
    if (cached) setItem(cached)
    void loadGuidebookItemDetail(itemId)
      .then(setItem)
      .catch(() => {
        if (!getGuidebookItemDetailCached(itemId)) setItem(null)
      })
  }, [itemId, visible])

  const name = item?.name?.trim() || labelFallback
  const icon = wikiItemIconUrl(item?.icon_id ?? '')

  const openPanel = () => openItemRoot(itemId)

  return (
    <div ref={ref} className="guidebook-material-req">
      <button
        type="button"
        className="guidebook-material-req__chip"
        onClick={openPanel}
        aria-label={`${quantity} ${name}, open item details`}
      >
        <span className="guidebook-material-req__qty">{quantity}</span>
        {icon ? (
          <img className="guidebook-material-req__icon" src={icon} alt="" width={48} height={48} />
        ) : (
          <span className="guidebook-material-req__icon guidebook-material-req__icon--empty" aria-hidden />
        )}
        <span className="guidebook-material-req__name">{name}</span>
      </button>
      {note ? <p className="guidebook-material-req__note muted">{note}</p> : null}
    </div>
  )
}

function GuidebookDigiviceFragmentGrid() {
  const { openItemRoot } = useGuidebookWikiOverlay()

  return (
    <section className="guidebook-fragment-farm" aria-label="Digivice crest fragments">
      <h4 className="guidebook-fragment-farm__title">
        Gather {GUIDEBOOK_DIGIVICE_FRAGMENT_EACH_COUNT} of each fragment
      </h4>
      <p className="guidebook-fragment-farm__hint muted">
        Click a fragment to see where it drops.
      </p>
      <ul className="guidebook-fragment-farm__grid">
        {GUIDEBOOK_DIGIVICE_FRAGMENTS.map((frag) => {
          const icon = wikiItemIconUrl(frag.iconId)
          return (
            <li key={frag.id}>
              <button
                type="button"
                className="guidebook-fragment-chip"
                onClick={() => openItemRoot(frag.id)}
                aria-label={`${GUIDEBOOK_DIGIVICE_FRAGMENT_EACH_COUNT} ${frag.name}, open drop sources`}
              >
                <span className="guidebook-fragment-chip__qty">{GUIDEBOOK_DIGIVICE_FRAGMENT_EACH_COUNT}</span>
                {icon ? (
                  <img className="guidebook-fragment-chip__icon" src={icon} alt="" width={36} height={36} />
                ) : (
                  <span className="guidebook-fragment-chip__icon guidebook-fragment-chip__icon--empty" aria-hidden />
                )}
                <span className="guidebook-fragment-chip__name">{frag.name}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function GuidebookDigiviceRollingNotes() {
  return (
    <GuidebookNotes ariaLabel="Rolling a digivice">
      <p className="guidebook-notes__lead">
        Once you have farmed the materials for a Digivice, you want to roll it with the following things
        in mind:
      </p>
      <ul className="guidebook-notes__list">
        <li>Generally, Vaccine, Virus and Data should be on the vice.</li>
        <li>The rest can be filled with elements you use.</li>
        <li>Unknown can be considered, but only if there are Unknown Digimon you wish to use.</li>
        <li>
          If you can craft 3 digivices, you can craft all 3 with VA/VI/DA/UK and different elements to have a
          digivice for ALL scenarios.
        </li>
      </ul>
    </GuidebookNotes>
  )
}

function GuidebookWikiMaterialChip({
  itemId,
  quantity,
  labelFallback,
}: {
  itemId: string
  quantity: number
  labelFallback: string
}) {
  const { openItemRoot } = useGuidebookWikiOverlay()
  const [item, setItem] = useState<WikiItemDetail | null>(() => getGuidebookItemDetailCached(itemId) ?? null)

  useEffect(() => {
    const cached = getGuidebookItemDetailCached(itemId)
    if (cached) setItem(cached)
    void loadGuidebookItemDetail(itemId)
      .then(setItem)
      .catch(() => {
        if (!getGuidebookItemDetailCached(itemId)) setItem(null)
      })
  }, [itemId])

  const name = item?.name?.trim() || labelFallback
  const icon = wikiItemIconUrl(item?.icon_id ?? '')

  return (
    <button
      type="button"
      className="guidebook-fragment-chip"
      onClick={() => openItemRoot(itemId)}
      aria-label={`${quantity} ${name}, open drop sources`}
    >
      <span className="guidebook-fragment-chip__qty">{quantity}</span>
      {icon ? (
        <img className="guidebook-fragment-chip__icon" src={icon} alt="" width={36} height={36} />
      ) : (
        <span className="guidebook-fragment-chip__icon guidebook-fragment-chip__icon--empty" aria-hidden />
      )}
      <span className="guidebook-fragment-chip__name">{name}</span>
    </button>
  )
}

function GuidebookWikiMaterialChipGrid({
  materials,
  ariaLabel,
}: {
  materials: readonly { itemId: string; quantity: number; labelFallback: string }[]
  ariaLabel: string
}) {
  return (
    <ul className="guidebook-fragment-farm__grid" aria-label={ariaLabel}>
      {materials.map((material) => (
        <li key={material.itemId}>
          <GuidebookWikiMaterialChip
            itemId={material.itemId}
            quantity={material.quantity}
            labelFallback={material.labelFallback}
          />
        </li>
      ))}
    </ul>
  )
}

export function GuideGearClothes() {
  const explorer = useMemo(() => guidebookClothesExplorerDigieggs(), [])
  const digital = useMemo(() => guidebookClothesDigitalDigieggs(), [])

  return (
    <div className="guidebook-clothes">
      <GuideProse>
        <p>
          Early clothes come from <strong>Explorer Gear Boxes</strong> and{' '}
          <strong>Digital Gear Boxes</strong>. Upgrade them with bits at the blacksmith in
          Olympus.
        </p>
      </GuideProse>

      <GuidebookClothesDigieggSection
        title="Explorer Gear Box"
        entries={explorer}
      />
      <GuidebookClothesDigieggSection
        title="Digital Gear Box"
        entries={digital}
      />
    </div>
  )
}

function GuidebookClothesDigieggSection({
  title,
  lead,
  entries,
}: {
  title: string
  lead?: string
  entries: readonly GuidebookClothesDigieggEntry[]
}) {
  return (
    <section className="guidebook-clothes-section" aria-labelledby={`guidebook-clothes-${title.replace(/\s+/g, '-').toLowerCase()}`}>
      <header className="guidebook-clothes-section__head">
        <div>
          <h4 id={`guidebook-clothes-${title.replace(/\s+/g, '-').toLowerCase()}`} className="guidebook-clothes-section__title">
            {title}
          </h4>
          {lead ? <p className="guidebook-clothes-section__lead muted">{lead}</p> : null}
        </div>
        <span className="guidebook-clothes-section__count">
          {entries.length} DigiEgg{entries.length === 1 ? '' : 's'}
        </span>
      </header>

      {!entries.length ? (
        <p className="guidebook-clothes-section__empty muted">No matching DigiEggs found on the wiki yet.</p>
      ) : (
        <ul className="guidebook-clothes-digieggs">
          {entries.map((entry) => (
            <li key={entry.id} className="guidebook-clothes-digieggs__item">
              <GuidebookItemHoverLink
                itemId={entry.id}
                labelFallback={guidebookClothesDigieggShortName(entry.name)}
                iconId={entry.iconId}
                hint={guidebookClothesDigieggClassLabel(entry)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function GuideGearChips() {
  return <GuidebookComingSoon />
}

export function GuideGearOlympusClothes() {
  return <GuidebookComingSoon />
}

export function GuideGearCorruptedChips() {
  return <GuidebookComingSoon />
}

export function GuideGearDarkAccessories() {
  return (
    <div className="guidebook-corrupted-page">
      <GuidebookDarkCraftSection />
    </div>
  )
}

export function GuideGearDigiAura() {
  return (
    <>
      <section className="guidebook-fragment-farm" aria-label="Promethean DigiAura craft">
        <h4 className="guidebook-fragment-farm__title">
          Craft Promethean DigiAura at the Blacksmith in Olympus
        </h4>

        <div className="guidebook-digiaura-material-group">
          <h5 className="guidebook-digiaura-material-group__title">Homeostasis Wish</h5>
          <GuidebookMaterialRequirement
            itemId={GUIDEBOOK_HOMEOSTASIS_WISH_ITEM_ID}
            quantity={GUIDEBOOK_PROMETHEAN_DIGIAURA_HOMEOSTASIS_COUNT}
            labelFallback="Homeostasis Wish"
          />
          <p className="guidebook-fragment-farm__hint muted">
            Can be obtained from the following dungeons.
          </p>
          <GuideGearRaidSourcesSection
            gearLabel="digiaura"
            itemIds={[GUIDEBOOK_HOMEOSTASIS_WISH_ITEM_ID]}
            showWip={false}
            dungeonAriaLabel="Homeostasis Wish dungeons"
            dungeonEmptyMessage="No dungeon sources are listed for Homeostasis Wish yet."
          />
        </div>

        <div className="guidebook-digiaura-material-group">
          <h5 className="guidebook-digiaura-material-group__title">Other materials</h5>
          <p className="guidebook-fragment-farm__hint muted">
            Click a material to open wiki drop sources.
          </p>
          <GuidebookWikiMaterialChipGrid
            materials={GUIDEBOOK_PROMETHEAN_DIGIAURA_MATERIALS}
            ariaLabel="Promethean DigiAura craft materials"
          />
        </div>
      </section>
    </>
  )
}

export function GuideGearDigivice() {
  return (
    <>
      <section className="guidebook-fragment-farm" aria-label="Homeostasis Wish">
        <h4 className="guidebook-fragment-farm__title">
          Gather {GUIDEBOOK_DIGIVICE_HOMEOSTASIS_WISH_COUNT} Homeostasis
        </h4>
        <GuidebookMaterialRequirement
          itemId={GUIDEBOOK_HOMEOSTASIS_WISH_ITEM_ID}
          quantity={GUIDEBOOK_DIGIVICE_HOMEOSTASIS_WISH_COUNT}
          labelFallback="Homeostasis Wish"
        />
        <p className="guidebook-fragment-farm__hint muted">
          Can be obtained from the following dungeons.
        </p>
        <GuideGearRaidSourcesSection
          gearLabel="digivice"
          itemIds={[GUIDEBOOK_HOMEOSTASIS_WISH_ITEM_ID]}
          showWip={false}
          dungeonAriaLabel="Homeostasis Wish dungeons"
          dungeonEmptyMessage="No dungeon sources are listed for Homeostasis Wish yet."
        />
      </section>

      <GuidebookDigiviceFragmentGrid />

      <GuidebookDigiviceRollingNotes />
    </>
  )
}

function GuidebookRingRollingNotes({ ring }: { ring: GuidebookRingEntry }) {
  return (
    <GuidebookGearStatRollPanels rolls={ring.rolls} ariaLabel={`${ring.name} stat rolls`} />
  )
}

function GuidebookCollectMaterialPick({
  material,
  selected,
  onSelect,
  quantitySuffix,
}: {
  material: GuidebookCorruptedCraftMaterial
  selected: boolean
  onSelect: () => void
  quantitySuffix?: string
}) {
  const [item, setItem] = useState<WikiItemDetail | null>(
    () => getGuidebookItemDetailCached(material.itemId) ?? null,
  )

  useEffect(() => {
    const cached = getGuidebookItemDetailCached(material.itemId)
    if (cached) setItem(cached)
    void loadGuidebookItemDetail(material.itemId)
      .then(setItem)
      .catch(() => {
        if (!getGuidebookItemDetailCached(material.itemId)) setItem(null)
      })
  }, [material.itemId])

  const name = item?.name?.trim() || material.labelFallback
  const icon = wikiItemIconUrl(item?.icon_id ?? '')

  return (
    <button
      type="button"
      className={`guidebook-collect-pick${selected ? ' is-selected' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${material.quantity}${quantitySuffix ? ` ${quantitySuffix.trim()}` : ''} ${name}, show drop sources`}
    >
      <span className="guidebook-collect-pick__qty">
        {material.quantity}
        {quantitySuffix ? (
          <span className="guidebook-collect-pick__qty-suffix">{quantitySuffix}</span>
        ) : null}
      </span>
      {icon ? (
        <img className="guidebook-collect-pick__icon" src={icon} alt="" width={22} height={22} />
      ) : (
        <span className="guidebook-collect-pick__icon guidebook-collect-pick__icon--empty" aria-hidden />
      )}
      <span className="guidebook-collect-pick__name">{name}</span>
    </button>
  )
}

function GuidebookDarkAccessoryCraftCard({ guide }: { guide: GuidebookDarkGearGuide }) {
  const materials = useMemo(() => guidebookDarkGearMaterials(guide), [guide])
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const selectedMaterial = materials.find((material) => material.itemId === selectedItemId)
  const title = guide.craftLabel.replace(/\b\w/g, (char) => char.toUpperCase())

  return (
    <article className="guidebook-corrupted-stat-block" aria-label={title}>
      <header className="guidebook-corrupted-stat-block__head">
        <h4 className="guidebook-corrupted-stat-block__title">{title}</h4>
        <p className="guidebook-corrupted-stat-block__craft muted">
          Requires 1 {guide.prerequisiteLabel}
        </p>
      </header>

      <div className="guidebook-corrupted-panel guidebook-corrupted-panel--materials">
        <p className="guidebook-corrupted-materials">
          <span className="guidebook-corrupted-materials__label">Per craft, collect</span>
          {materials.map((material, index) => (
            <span key={`${material.itemId}-${material.labelFallback}`}>
              {index > 0 ? (
                <span className="guidebook-corrupted-materials__label">
                  {index === materials.length - 1 ? 'and' : ','}
                </span>
              ) : null}
              <GuidebookCollectMaterialPick
                material={material}
                selected={selectedItemId === material.itemId}
                onSelect={() =>
                  setSelectedItemId((prev) =>
                    prev === material.itemId ? null : material.itemId,
                  )
                }
              />
            </span>
          ))}
        </p>
      </div>

      <div className="guidebook-material-sources" aria-live="polite">
        {selectedMaterial ? (
          <GuideGearRaidSourcesSection
            gearLabel={guide.gearLabel}
            itemIds={[selectedMaterial.itemId]}
            showWip={false}
            dungeonAriaLabel={`${selectedMaterial.labelFallback} sources`}
            dungeonEmptyMessage={`No sources are listed for ${selectedMaterial.labelFallback} yet.`}
          />
        ) : (
          <p className="guidebook-material-sources__hint muted">
            Select a material above to see where it drops.
          </p>
        )}
      </div>
    </article>
  )
}

function GuidebookDarkCraftSection() {
  return (
    <GuidebookCorruptedSection
      step={1}
      title="Craft dark accessories"
      lead="Upgrade each corrupted accessory at Zudomon in Olympus. Material costs below are per craft."
    >
      <p className="guidebook-corrupted-note muted">{GUIDEBOOK_DARK_GEAR_TRADEABLE_DISCLAIMER}</p>
      <div className="guidebook-corrupted-stat-blocks">
        {GUIDEBOOK_DARK_GEAR_GUIDES.map((guide) => (
          <GuidebookDarkAccessoryCraftCard key={guide.slug} guide={guide} />
        ))}
      </div>
    </GuidebookCorruptedSection>
  )
}

function GuidebookCorruptedGearRollNotes({
  rolls,
  ariaLabel,
}: {
  rolls: GuidebookCorruptedGearGuide['rolls']
  ariaLabel: string
}) {
  return (
    <GuidebookGearStatRollPanels
      rolls={rolls}
      ariaLabel={ariaLabel}
      hideSectionHeader
      className="guidebook-stat-recommendations--corrupted"
    />
  )
}

function GuidebookCorruptedSection({
  step,
  title,
  lead,
  children,
}: {
  step: number
  title: string
  lead?: string
  children: ReactNode
}) {
  const titleId = `guidebook-corrupted-section-${step}-${title.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <section className="guidebook-corrupted-section" aria-labelledby={titleId}>
      <header className="guidebook-corrupted-section__head">
        <div className="guidebook-corrupted-section__title-row">
          <span className="guidebook-corrupted-section__step" aria-hidden>
            {step}
          </span>
          <h3 id={titleId} className="guidebook-corrupted-section__title">
            {title}
          </h3>
        </div>
        {lead ? <p className="guidebook-corrupted-section__lead muted">{lead}</p> : null}
      </header>
      <div className="guidebook-corrupted-section__body">{children}</div>
    </section>
  )
}

function GuidebookCorruptedAlternativeSources() {
  const { ref, visible } = useWhenVisible<HTMLDivElement>()
  const sourceRows = useMemo(() => guidebookDarkMastersTokenSources(), [])
  const [dungeons, setDungeons] = useState<ReturnType<typeof sortDarkMastersTokenDungeonsByLevel> | null>(
    null,
  )
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible || !sourceRows.length) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)

    void (async () => {
      const entries = []
      for (const row of sourceRows) {
        let detail = getGuidebookDungeonDetailCached(row.dungeonId)
        if (!detail) {
          try {
            detail = await loadGuidebookDungeonDetail(row.dungeonId)
          } catch {
            detail = null
          }
        }
        entries.push(guidebookDarkMastersTokenDungeonEntryFromRow(row, detail))
      }
      if (cancelled) return
      setDungeons(sortDarkMastersTokenDungeonsByLevel(entries))
      setLoading(false)
    })().catch(() => {
      if (!cancelled) {
        setLoadError('Could not load dungeon details.')
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [visible, sourceRows])

  return (
    <div ref={ref}>
      <GuidebookCorruptedSection
        step={2}
        title="Other ways to farm materials"
        lead="If direct dungeon drops are slow, use the weekly quest or trade Dark Masters Tokens."
      >
        <div className="guidebook-corrupted-subsection">
          <h4 className="guidebook-corrupted-subsection__title">Weekly quest</h4>
          <p className="guidebook-corrupted-subsection__text">
            <GuidebookQuestHoverLink
              questId={GUIDEBOOK_PREPARING_APOCALYPSE_QUEST_ID}
              labelFallback="[Weekly] Preparing for the Apocalypse"
            />{' '}
            rewards {GUIDEBOOK_PREPARING_APOCALYPSE_DARK_DIGICORE_COUNT}{' '}
            <GuidebookItemHoverLink
              itemId={GUIDEBOOK_DARK_DIGICORE_ITEM_ID}
              labelFallback="Dark DigiCore"
            />{' '}
            and {GUIDEBOOK_PREPARING_APOCALYPSE_ENERGIZED_DIGICORE_COUNT}{' '}
            <GuidebookItemHoverLink
              itemId={GUIDEBOOK_ENERGIZED_DARK_DIGICORE_ITEM_ID}
              labelFallback="Energized Dark DigiCore"
            />{' '}
            per week.
          </p>
        </div>

        <div className="guidebook-corrupted-subsection">
          <h4 className="guidebook-corrupted-subsection__title">Dark Masters Token</h4>
          <p className="guidebook-corrupted-subsection__text">
            <GuidebookItemHoverLink
              itemId={GUIDEBOOK_DARK_MASTERS_TOKEN_ITEM_ID}
              labelFallback="Dark Masters Token"
            />{' '}
            is pity currency from the dungeons below. Trade with Zudomon in Olympus:{' '}
            {GUIDEBOOK_DARK_MASTERS_TOKEN_DARK_DIGICORE_COST} tokens for one{' '}
            <GuidebookItemHoverLink
              itemId={GUIDEBOOK_DARK_DIGICORE_ITEM_ID}
              labelFallback="Dark DigiCore"
            />
            , or {GUIDEBOOK_DARK_MASTERS_TOKEN_ENERGIZED_DIGICORE_COST} tokens for one{' '}
            <GuidebookItemHoverLink
              itemId={GUIDEBOOK_ENERGIZED_DARK_DIGICORE_ITEM_ID}
              labelFallback="Energized Dark DigiCore"
            />
            .
          </p>
          {visible && loading ? (
            <p className="guidebook-corrupted-alt__status muted">Loading dungeons…</p>
          ) : null}
          {visible && loadError ? <p className="guidebook-error">{loadError}</p> : null}
          {visible && !loading && !loadError && dungeons?.length ? (
            <>
              <p className="guidebook-corrupted-subsection__list-label">Token dungeons</p>
              <ul className="guidebook-corrupted-alt__dungeon-list">
                {dungeons.map((dungeon) => (
                  <li
                    key={`${dungeon.dungeonId}-${dungeon.difficulty}`}
                    className="guidebook-corrupted-alt__dungeon-row"
                  >
                    <span className="guidebook-corrupted-alt__dungeon-level">
                      {dungeon.bossLevel != null ? `Lv. ${dungeon.bossLevel}` : '—'}
                    </span>
                    <span className="guidebook-corrupted-alt__dungeon-name">{dungeon.dungeonName}</span>
                    <span
                      className={`guidebook-dungeon-diff guidebook-dungeon-diff--${dungeon.difficultySlug} guidebook-corrupted-alt__dungeon-diff`}
                    >
                      {dungeon.difficulty}
                    </span>
                    <span className="guidebook-corrupted-alt__dungeon-token muted">
                      ×{dungeon.tokenCount} token{dungeon.tokenCount === 1 ? '' : 's'}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </GuidebookCorruptedSection>
    </div>
  )
}

function GuidebookCorruptedCraftSection() {
  const materials = GUIDEBOOK_CORRUPTED_CRAFT_MATERIALS
  const [materialA, materialB] = materials
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)

  const selectedMaterial = materials.find((m) => m.itemId === selectedItemId)
  const totalDark =
    GUIDEBOOK_CORRUPTED_RING_DARK_DIGICORE_COUNT * GUIDEBOOK_CORRUPTED_ACCESSORY_CRAFT_COUNT
  const totalEnergized =
    GUIDEBOOK_CORRUPTED_RING_ENERGIZED_DIGICORE_COUNT * GUIDEBOOK_CORRUPTED_ACCESSORY_CRAFT_COUNT

  return (
    <GuidebookCorruptedSection
      step={1}
      title="Craft corrupted accessories"
      lead="Ring, necklace, and earring at the Blacksmith in Olympus. Material costs below are per accessory."
    >
      {materialA && materialB ? (
        <>
          <div className="guidebook-corrupted-panel guidebook-corrupted-panel--materials">
            <p className="guidebook-corrupted-materials">
              <span className="guidebook-corrupted-materials__label">Per accessory, collect</span>
              <GuidebookCollectMaterialPick
                material={materialA}
                quantitySuffix=" each"
                selected={selectedItemId === materialA.itemId}
                onSelect={() =>
                  setSelectedItemId((prev) => (prev === materialA.itemId ? null : materialA.itemId))
                }
              />
              <span className="guidebook-corrupted-materials__label">and</span>
              <GuidebookCollectMaterialPick
                material={materialB}
                quantitySuffix=" each"
                selected={selectedItemId === materialB.itemId}
                onSelect={() =>
                  setSelectedItemId((prev) =>
                    prev === materialB.itemId ? null : materialB.itemId,
                  )
                }
              />
            </p>
            <p className="guidebook-corrupted-materials-total muted">
              All three accessories: {totalDark} Dark DigiCore and {totalEnergized} Energized Dark
              DigiCore total.
            </p>
          </div>
          <p className="guidebook-corrupted-note muted">{GUIDEBOOK_CORRUPTED_GEAR_TRADEABLE_DISCLAIMER}</p>
          <div className="guidebook-material-sources" aria-live="polite">
            {selectedMaterial ? (
              <GuideGearRaidSourcesSection
                gearLabel="accessory"
                itemIds={[selectedMaterial.itemId]}
                showWip={false}
                dungeonAriaLabel={`${selectedMaterial.labelFallback} sources`}
                dungeonEmptyMessage={`No sources are listed for ${selectedMaterial.labelFallback} yet.`}
              />
            ) : (
              <p className="guidebook-material-sources__hint muted">
                Select a material above to see where it drops.
              </p>
            )}
          </div>
        </>
      ) : null}
    </GuidebookCorruptedSection>
  )
}

function GuidebookCorruptedStatRecommendationsSection() {
  return (
    <GuidebookCorruptedSection
      step={3}
      title="Stat recommendations"
      lead="Roll these stats when crafting each corrupted accessory from its data piece."
    >
      <div className="guidebook-corrupted-stat-blocks">
        {GUIDEBOOK_CORRUPTED_GEAR_GUIDES.map((guide) => (
          <article key={guide.slug} className="guidebook-corrupted-stat-block">
            <header className="guidebook-corrupted-stat-block__head">
              <h4 className="guidebook-corrupted-stat-block__title">{guide.dataTitle}</h4>
              <p className="guidebook-corrupted-stat-block__craft muted">
                Crafts into {guide.craftLabel}
              </p>
            </header>
            <GuidebookCorruptedGearRollNotes
              rolls={guide.rolls}
              ariaLabel={`${guide.dataTitle} stat rolls`}
            />
            {guide.dataItemId ? (
              <div className="guidebook-corrupted-subsection guidebook-corrupted-subsection--sources">
                <h4 className="guidebook-corrupted-subsection__title">Where to farm</h4>
                <GuideGearRaidSourcesSection
                  gearLabel={guide.gearLabel}
                  itemIds={[guide.dataItemId]}
                  showWip={false}
                  dungeonAriaLabel={`${guide.dataTitle} dungeons`}
                  dungeonEmptyMessage={`No dungeon sources are listed for ${guide.dataTitle} yet.`}
                />
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </GuidebookCorruptedSection>
  )
}

export function GuideGearCorruptedAccessories() {
  return (
    <div className="guidebook-corrupted-page">
      <GuidebookCorruptedCraftSection />
      <GuidebookCorruptedAlternativeSources />
      <GuidebookCorruptedStatRecommendationsSection />
    </div>
  )
}

function GuidebookRingEntrySection({ ring }: { ring: GuidebookRingEntry }) {
  return (
    <section className="guidebook-ring-entry" aria-label={ring.name}>
      <h4 className="guidebook-fragment-farm__title">{ring.name}</h4>
      <GuidebookRingRollingNotes ring={ring} />
      {ring.itemId ? (
        <>
          <p className="guidebook-fragment-farm__hint muted">
            Can be obtained from the following dungeons.
          </p>
          <GuideGearRaidSourcesSection
            gearLabel="ring"
            itemIds={[ring.itemId]}
            showWip={false}
            dungeonAriaLabel={`${ring.name} dungeons`}
            dungeonEmptyMessage={`No dungeon sources are listed for ${ring.name} yet.`}
          />
        </>
      ) : null}
    </section>
  )
}

export function GuideGearRing() {
  const goldenRing = GUIDEBOOK_RING_ENTRIES.find((ring) => ring.slug === 'golden-seadragon')
  if (!goldenRing) return null
  return (
    <div className="guidebook-ring-track">
      <GuidebookRingEntrySection ring={goldenRing} />
    </div>
  )
}

export function GuideGearEarring() {
  return (
    <div className="guidebook-ring-track">
      <section className="guidebook-ring-entry" aria-label="Earring Data">
        <GuidebookCorruptedGearRollNotes
          rolls={GUIDEBOOK_EARLY_EARRING_ROLLS}
          ariaLabel="Earring stat rolls"
        />
        <p className="guidebook-fragment-farm__hint muted">
          Can be obtained from the following dungeons and raids.
        </p>
        <GuideGearRaidSourcesSection
          gearLabel="earring"
          itemIds={GUIDEBOOK_EARRING_DATA_ITEM_IDS}
          showWip={false}
          dungeonAriaLabel="Earring Data sources"
          dungeonEmptyMessage="No sources are listed for Earring Data yet."
        />
      </section>
    </div>
  )
}

export function GuideGearNecklace() {
  return (
    <div className="guidebook-ring-track">
      <section className="guidebook-ring-entry" aria-label="Necklace Data">
        <GuidebookCorruptedGearRollNotes
          rolls={GUIDEBOOK_EARLY_NECKLACE_ROLLS}
          ariaLabel="Necklace stat rolls"
        />
        <p className="guidebook-fragment-farm__hint muted">
          Can be obtained from the following dungeons and raids.
        </p>
        <GuideGearRaidSourcesSection
          gearLabel="necklace"
          itemIds={GUIDEBOOK_NECKLACE_DATA_ITEM_IDS}
          showWip={false}
          dungeonAriaLabel="Necklace Data sources"
          dungeonEmptyMessage="No sources are listed for Necklace Data yet."
        />
      </section>
    </div>
  )
}

export function GuideGearKeyring() {
  return (
    <div className="guidebook-ring-track">
      <section className="guidebook-ring-entry" aria-label="Keyring Data">
        <GuidebookNotes ariaLabel="Keyring stats">
          <p className="guidebook-notes__lead">{GUIDEBOOK_KEYRING_STAT_NOTES_LEAD}</p>
          <ul className="guidebook-notes__list guidebook-notes__list--rolls">
            {GUIDEBOOK_KEYRING_STAT_ROLLS.map((roll) => (
              <li key={roll.label}>
                <span className="guidebook-notes__roll-label">{roll.label}:</span>{' '}
                <span className="guidebook-notes__roll-stats">{roll.stats}</span>
              </li>
            ))}
          </ul>
        </GuidebookNotes>
        <p className="guidebook-fragment-farm__hint muted">
          Can be obtained from the following dungeons and raids.
        </p>
        <GuideGearRaidSourcesSection
          gearLabel="keyring"
          itemIds={GUIDEBOOK_KEYRING_DATA_ITEM_IDS}
          showWip={false}
          dungeonAriaLabel="Keyring Data sources"
          dungeonEmptyMessage="No sources are listed for Keyring Data yet."
        />
      </section>
    </div>
  )
}

export function GuideGearGoggles() {
  return (
    <div className="guidebook-ring-track">
      <section className="guidebook-ring-entry" aria-label="Goggles Data">
        <GuidebookNotes ariaLabel="Goggles stats">
          <p className="guidebook-notes__lead">{GUIDEBOOK_GOGGLES_STAT_NOTES}</p>
        </GuidebookNotes>
        <p className="guidebook-fragment-farm__hint muted">
          Can be obtained from the following dungeons and raids.
        </p>
        <GuideGearRaidSourcesSection
          gearLabel="goggles"
          itemIds={GUIDEBOOK_GOGGLES_DATA_ITEM_IDS}
          showWip={false}
          dungeonAriaLabel="Goggles Data sources"
          dungeonEmptyMessage="No sources are listed for Goggles Data yet."
        />
      </section>
    </div>
  )
}

export function GuidebookSeals() {
  const earlyCategories = useMemo(() => guidebookSealCategories(), [])
  const odysseyCategories = useMemo(() => guidebookOdysseySealPackCategories(), [])

  return (
    <div className="guidebook-seals-page guidebook-corrupted-page">
      <GuidebookCorruptedSection
        step={1}
        title="Early game"
        lead="Farm Digimon Seal Boxes from dungeons. Each box gives random seals for that stat."
      >
        <div className="guidebook-seals-stats">
          {earlyCategories.map((category) => (
            <GuidebookSealBoxSection key={category.itemId} category={category} />
          ))}
        </div>
      </GuidebookCorruptedSection>

      <GuidebookCorruptedSection
        step={2}
        title="Midgame"
        lead="Odyssey Seal Packs scan into three seals. Seal Exchange Tickets trade at Digitamon in Olympus."
      >
        <div className="guidebook-corrupted-subsection">
          <h4 className="guidebook-corrupted-subsection__title">Odyssey Seal Pack</h4>
          <p className="guidebook-corrupted-subsection__text muted">
            Each pack scans into three random seals for that stat. Drops from field raid bosses.
          </p>
          <div className="guidebook-seals-stats">
            {odysseyCategories.map((category) => (
              <GuidebookOdysseySealPackSection key={category.itemId} category={category} />
            ))}
          </div>
        </div>

        <div className="guidebook-corrupted-subsection">
          <h4 className="guidebook-corrupted-subsection__title">Seal Exchange</h4>
          <p className="guidebook-corrupted-subsection__text">
            Trade{' '}
            <GuidebookItemHoverLink
              itemId={GUIDEBOOK_SEAL_EXCHANGE_TICKET_ITEM_ID}
              labelFallback="Seal Exchange Ticket"
            />{' '}
            with Digitamon in Olympus for various seals, including ones not from dungeon boxes or
            Odyssey packs.
          </p>
          <div className="guidebook-corrupted-subsection--sources">
            <GuideGearRaidSourcesSection
              gearLabel="seal exchange ticket"
              itemIds={[GUIDEBOOK_SEAL_EXCHANGE_TICKET_ITEM_ID]}
              showWip={false}
              dungeonAriaLabel="Seal Exchange Ticket raid sources"
              dungeonEmptyMessage="No raid sources are listed for Seal Exchange Ticket yet."
            />
          </div>
        </div>
      </GuidebookCorruptedSection>

      <GuidebookCorruptedSection step={3} title="Endgame">
        <div className="guidebook-corrupted-subsection">
          <p className="guidebook-corrupted-subsection__text">
            <GuidebookItemHoverLink
              itemId={GUIDEBOOK_EXAMON_SEAL_ITEM_ID}
              labelFallback="Examon Seal"
            />{' '}
            drops from Dragon Dimension.
          </p>
          <div className="guidebook-corrupted-subsection--sources">
            <GuideGearRaidSourcesSection
              gearLabel="Examon Seal"
              itemIds={[GUIDEBOOK_EXAMON_SEAL_ITEM_ID]}
              showWip={false}
              dungeonAriaLabel="Examon Seal sources"
              dungeonEmptyMessage="No raid sources are listed for Examon Seal yet."
            />
          </div>
        </div>
      </GuidebookCorruptedSection>
    </div>
  )
}

type GuidebookSealRaidBossRow = {
  bossId: string
  bossName: string
  bossLevel: number | null
  rate: number
  min: number
  max: number
}

function dedupeSealRaidBossSources(sources: WikiItemRaidSource[]): GuidebookSealRaidBossRow[] {
  const map = new Map<string, GuidebookSealRaidBossRow>()
  for (const src of sources) {
    if (!src.boss_id) continue
    const existing = map.get(src.boss_id)
    if (!existing || src.rate > existing.rate) {
      map.set(src.boss_id, {
        bossId: src.boss_id,
        bossName: src.boss_name?.trim() || src.boss_id,
        bossLevel: src.boss_level ?? null,
        rate: src.rate,
        min: src.min,
        max: src.max,
      })
    }
  }
  return [...map.values()].sort((a, b) => {
    const lvlA = a.bossLevel ?? Number.MAX_SAFE_INTEGER
    const lvlB = b.bossLevel ?? Number.MAX_SAFE_INTEGER
    if (lvlA !== lvlB) return lvlA - lvlB
    return a.bossName.localeCompare(b.bossName)
  })
}

function GuidebookOdysseySealPackSection({ category }: { category: GuidebookOdysseySealPack }) {
  const [open, setOpen] = useState(false)
  const [bosses, setBosses] = useState<GuidebookSealRaidBossRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || bosses) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)

    void loadGuidebookItemDetail(category.itemId)
      .then((item) => {
        if (cancelled) return
        setBosses(dedupeSealRaidBossSources(item.raid_sources ?? []))
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('Could not load raid boss sources.')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [open, category.itemId, bosses])

  const bossLabel = bosses
    ? `${bosses.length} raid boss${bosses.length === 1 ? '' : 'es'}`
    : 'Field raids'

  return (
    <details
      className="guidebook-seals-stat"
      aria-label={`${category.itemName} sources`}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="guidebook-seals-stat__summary">
        <img
          className="guidebook-seals-stat__icon"
          src={wikiItemIconUrl(category.iconId)}
          alt=""
          width={36}
          height={36}
          loading="lazy"
          decoding="async"
        />
        <div className="guidebook-seals-stat__titles">
          <span className="guidebook-seals-stat__box">{category.itemName}</span>
          <span className="guidebook-seals-stat__stat muted">
            {category.label} ({category.boxTag}) · scan ×3
          </span>
        </div>
        <span className="guidebook-seals-stat__badge">{bossLabel}</span>
      </summary>

      <div className="guidebook-seals-stat__panel">
        {loading ? (
          <p className="guidebook-seals-stat__empty muted">Loading raid bosses…</p>
        ) : loadError ? (
          <p className="guidebook-seals-stat__empty guidebook-error">{loadError}</p>
        ) : bosses?.length ? (
          <ul className="guidebook-seals-raid-boss-list">
            {bosses.map((boss) => (
              <li key={boss.bossId} className="guidebook-seals-raid-boss-list__row">
                <span className="guidebook-seals-raid-boss-list__level">
                  {boss.bossLevel != null ? `Lv. ${boss.bossLevel}` : '—'}
                </span>
                <GuidebookMonsterLink
                  monsterId={boss.bossId}
                  monsterName={boss.bossName}
                  monsterLevel={boss.bossLevel ?? 0}
                  variant="inline"
                />
                <span className="guidebook-seals-raid-boss-list__drop muted">
                  {formatRaidRatePermil(boss.rate)} · {formatRaidQuantity(boss.min, boss.max)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="guidebook-seals-stat__empty muted">
            No raid boss sources are listed for this pack yet.
          </p>
        )}
      </div>
    </details>
  )
}

function GuidebookSealBoxSection({ category }: { category: GuidebookSealCategory }) {
  const sourceRows = useMemo(
    () => guidebookSealSourcesForItem(category.itemId),
    [category.itemId],
  )
  const [open, setOpen] = useState(false)
  const [dungeons, setDungeons] = useState<GuidebookSealDungeonEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || dungeons || !sourceRows.length) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)

    void (async () => {
      const entries: GuidebookSealDungeonEntry[] = []
      for (const row of sourceRows) {
        let detail = getGuidebookDungeonDetailCached(row.dungeonId)
        if (!detail) {
          try {
            detail = await loadGuidebookDungeonDetail(row.dungeonId)
          } catch {
            detail = null
          }
        }
        entries.push(guidebookSealDungeonEntryFromRow(row, detail))
      }
      if (cancelled) return
      setDungeons(sortSealDungeonsByLevel(entries))
      setLoading(false)
    })().catch(() => {
      if (!cancelled) {
        setLoadError('Could not load dungeon levels.')
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [open, sourceRows, dungeons])

  const dungeonLabel = `${sourceRows.length} dungeon${sourceRows.length === 1 ? '' : 's'}`

  return (
    <details
      className="guidebook-seals-stat"
      aria-label={`${category.itemName} sources`}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="guidebook-seals-stat__summary">
        <img
          className="guidebook-seals-stat__icon"
          src={wikiItemIconUrl(category.iconId)}
          alt=""
          width={36}
          height={36}
          loading="lazy"
          decoding="async"
        />
        <div className="guidebook-seals-stat__titles">
          <span className="guidebook-seals-stat__box">{category.itemName}</span>
          <span className="guidebook-seals-stat__stat muted">
            {category.label} ({category.boxTag})
          </span>
        </div>
        <span className="guidebook-seals-stat__badge">{dungeonLabel}</span>
      </summary>

      <div className="guidebook-seals-stat__panel">
        {!sourceRows.length ? (
          <p className="guidebook-seals-stat__empty muted">
            No dungeon sources are listed for this seal box yet.
          </p>
        ) : loading ? (
          <p className="guidebook-seals-stat__empty muted">Loading dungeon levels…</p>
        ) : loadError ? (
          <p className="guidebook-seals-stat__empty guidebook-error">{loadError}</p>
        ) : dungeons?.length ? (
          <ul className="guidebook-seals-dungeon-list">
            {dungeons.map((dungeon) => (
              <li key={`${dungeon.dungeonId}-${dungeon.difficulty}`} className="guidebook-seals-dungeon-list__row">
                <span className="guidebook-seals-dungeon-list__level">
                  {dungeon.bossLevel != null ? `Lv. ${dungeon.bossLevel}` : '—'}
                </span>
                <span className="guidebook-seals-dungeon-list__name">{dungeon.dungeonName}</span>
                <span
                  className={`guidebook-dungeon-diff guidebook-dungeon-diff--${dungeon.difficultySlug} guidebook-seals-dungeon-list__diff`}
                >
                  {dungeon.difficulty}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </details>
  )
}
