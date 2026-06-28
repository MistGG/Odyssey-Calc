import { Fragment, useMemo, type KeyboardEvent, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { wikiDungeonPageUrl } from '../../api/dungeonService'
import { digimonPortraitUrl, monsterPortraitUrl, rankSpriteStyle, skillIconUrl, wikiItemIconUrl } from '../../lib/digimonImage'
import { digimonStagePortraitGradient } from '../../lib/digimonStage'
import {
  SKILL_LEVEL_CAP,
  skillDamageAtLevel,
  skillIsSupportOnly,
} from '../../lib/skillDamage'
import {
  dedupeMonsterLocations,
  formatMonsterPenName,
  groupMonsterDropsByType,
} from '../../lib/guidebookMonsterPanel'
import { wikiCombatStatRows } from '../../lib/wikiCombatStatRows'
import {
  dedupeItemDropSources,
  formatRaidQuantity,
  formatRaidRatePermil,
  raidSourceKey,
  splitWikiItemDescription,
} from '../../lib/guidebookItemPanel'
import type { WikiDigimonDetail, WikiItemDetail, WikiMonsterDetail, WikiSkill } from '../../types/wikiApi'
import { EvolutionTree } from '../EvolutionTree'
import { useGuidebookWikiOverlay } from './GuidebookWikiOverlay'

function formatDigimonSkillSummary(skill: WikiSkill): string {
  const cap = Math.max(1, Math.min(skill.max_level ?? SKILL_LEVEL_CAP, SKILL_LEVEL_CAP))
  const support = skillIsSupportOnly(skill.base_dmg, skill.scaling)
  const parts: string[] = []

  if (skill.element?.trim()) parts.push(skill.element.trim())

  if (support) {
    parts.push('Support')
    if (typeof skill.buff?.duration === 'number' && skill.buff.duration > 0) {
      parts.push(`${skill.buff.duration}s buff`)
    }
  } else {
    const dmg = skillDamageAtLevel(skill.base_dmg, skill.scaling, cap, cap)
    parts.push(`${dmg.toLocaleString()} dmg`)
  }

  if (skill.cooldown_sec > 0) parts.push(`${skill.cooldown_sec}s CD`)
  if (skill.ds_cost > 0) parts.push(`${skill.ds_cost} DS`)
  if (typeof skill.radius === 'number' && skill.radius > 0) parts.push('AOE')

  return parts.join(' · ')
}

function GuidebookDigimonSkillRow({ skill }: { skill: WikiSkill }) {
  const icon = skillIconUrl(skill.icon_id)
  const summary = formatDigimonSkillSummary(skill)

  return (
    <li className="guidebook-digimon-panel__skill">
      {icon ? (
        <img className="guidebook-digimon-panel__skill-icon" src={icon} alt="" width={20} height={20} />
      ) : (
        <span className="guidebook-digimon-panel__skill-icon-fallback" aria-hidden>
          ·
        </span>
      )}
      <div className="guidebook-digimon-panel__skill-body">
        <span className="guidebook-digimon-panel__skill-name">{skill.name}</span>
        <span className="guidebook-digimon-panel__skill-meta">{summary}</span>
      </div>
    </li>
  )
}

function GuidebookWikiPanelNav({
  canGoBack,
  onBack,
  onClose,
}: {
  canGoBack?: boolean
  onBack?: () => void
  onClose: () => void
}) {
  return (
    <div className="guidebook-wiki-panel__nav">
      {canGoBack && onBack ? (
        <button type="button" className="guidebook-wiki-panel__back" onClick={onBack} aria-label="Back">
          ← Back
        </button>
      ) : null}
      <button type="button" className="guidebook-item-panel__close" onClick={onClose} aria-label="Close">
        ✕
      </button>
    </div>
  )
}

function WikiItemDescription({ description }: { description: string }) {
  const parts = useMemo(() => splitWikiItemDescription(description), [description])
  return (
    <p className="guidebook-item-panel__desc">
      {parts.map((part, i) =>
        part.highlight ? (
          <span key={i} className="guidebook-item-panel__desc-tag">
            {part.text}
          </span>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </p>
  )
}

/** Monster link that pushes onto the shared wiki overlay stack. */
export function GuidebookMonsterLink({
  monsterId,
  monsterName,
  monsterLevel,
  dropType,
  variant = 'drop-row',
}: {
  monsterId: string
  monsterName: string
  monsterLevel: number
  dropType?: string
  variant?: 'drop-row' | 'inline'
}) {
  const { pushMonster } = useGuidebookWikiOverlay()

  const open = (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation()
    e.preventDefault()
    pushMonster(monsterId)
  }

  if (variant === 'inline') {
    return (
      <button
        type="button"
        className="guidebook-item-panel__raid-boss-btn"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={open}
      >
        {monsterName} <span className="guidebook-item-panel__drop-lv">[Lv.{monsterLevel}]</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      className="guidebook-item-panel__drop-row guidebook-item-panel__drop-row--btn"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={open}
    >
      <span className="guidebook-item-panel__drop-name">
        {monsterName} <span className="guidebook-item-panel__drop-lv">[Lv.{monsterLevel}]</span>
      </span>
      {dropType ? (
        <span
          className={`guidebook-item-panel__drop-badge guidebook-item-panel__drop-badge--${dropType.toLowerCase()}`}
        >
          {dropType}
        </span>
      ) : null}
    </button>
  )
}

function GuidebookItemLootButton({
  itemId,
  itemName,
  iconId,
}: {
  itemId: string
  itemName: string
  iconId: string
}) {
  const { pushItem } = useGuidebookWikiOverlay()
  const icon = wikiItemIconUrl(iconId)

  return (
    <button
      type="button"
      className="guidebook-monster-panel__loot-btn"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        pushItem(itemId)
      }}
    >
      {icon ? (
        <img className="guidebook-monster-panel__loot-icon" src={icon} alt="" width={20} height={20} />
      ) : null}
      <span className="guidebook-monster-panel__loot-label">{itemName}</span>
    </button>
  )
}

export function GuidebookItemProfilePanel({
  item,
  canGoBack,
  onBack,
  onClose,
}: {
  item: WikiItemDetail
  canGoBack?: boolean
  onBack?: () => void
  onClose: () => void
}) {
  const icon = wikiItemIconUrl(item.icon_id)
  const dropSources = useMemo(
    () => dedupeItemDropSources(item.drop_sources ?? []),
    [item.drop_sources],
  )
  const raidSources = useMemo(
    () => [...(item.raid_sources ?? [])].sort((a, b) => b.rate - a.rate),
    [item.raid_sources],
  )

  return (
    <div className="guidebook-item-panel" onMouseDown={(e) => e.stopPropagation()}>
      <header className="guidebook-item-panel__header">
        <div className="guidebook-item-panel__icon-wrap">
          {icon ? (
            <img
              className="guidebook-item-panel__icon"
              src={icon}
              alt=""
              width={40}
              height={40}
            />
          ) : (
            <span className="guidebook-item-panel__icon-fallback" aria-hidden>
              📦
            </span>
          )}
        </div>
        <div className="guidebook-item-panel__head-text">
          <h3 className="guidebook-item-panel__name">{item.name}</h3>
          {item.description ? <WikiItemDescription description={item.description} /> : null}
        </div>
        <GuidebookWikiPanelNav canGoBack={canGoBack} onBack={onBack} onClose={onClose} />
      </header>

      <div className="guidebook-item-panel__body">
        {dropSources.length > 0 ? (
          <section className="guidebook-item-panel__section">
            <h4 className="guidebook-item-panel__sh">Dropped by</h4>
            <div className="guidebook-item-panel__list">
              {dropSources.map((drop) => (
                <GuidebookMonsterLink
                  key={drop.monster_id}
                  monsterId={drop.monster_id}
                  monsterName={drop.monster_name}
                  monsterLevel={drop.monster_level}
                  dropType={drop.drop_type}
                />
              ))}
            </div>
          </section>
        ) : null}

        {raidSources.length > 0 ? (
          <section className="guidebook-item-panel__section">
            <h4 className="guidebook-item-panel__sh guidebook-item-panel__sh--raid">Raid rewards</h4>
            <div className="guidebook-item-panel__list">
              {raidSources.map((raid, index) => (
                <div key={raidSourceKey(raid, index)} className="guidebook-item-panel__raid-row">
                  <div className="guidebook-item-panel__raid-top">
                    <GuidebookMonsterLink
                      monsterId={raid.boss_id}
                      monsterName={raid.boss_name}
                      monsterLevel={raid.boss_level}
                      variant="inline"
                    />
                    <span className="guidebook-item-panel__raid-rank">
                      {raid.rank_start === raid.rank_end
                        ? `Place ${raid.rank_start}`
                        : `Places ${raid.rank_start}–${raid.rank_end}`}
                    </span>
                    <span className="guidebook-item-panel__raid-qty">
                      {formatRaidQuantity(raid.min, raid.max)}
                    </span>
                    <span className="guidebook-item-panel__raid-rate">
                      {formatRaidRatePermil(raid.rate)}
                    </span>
                  </div>
                  {raid.dungeons?.length ? (
                    <p className="guidebook-item-panel__raid-dungeons">
                      Dungeon:{' '}
                      {raid.dungeons.map((dungeon, dIndex) => (
                        <Fragment key={dungeon.id}>
                          {dIndex > 0 ? ', ' : null}
                          <a
                            href={wikiDungeonPageUrl(dungeon.id)}
                            target="_blank"
                            rel="noreferrer"
                            className="guidebook-item-panel__raid-dungeon-link"
                          >
                            {dungeon.name}
                          </a>
                        </Fragment>
                      ))}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}

export function GuidebookMonsterProfilePanel({
  monster,
  canGoBack,
  onBack,
  onClose,
}: {
  monster: WikiMonsterDetail
  canGoBack?: boolean
  onBack?: () => void
  onClose: () => void
}) {
  const portrait = monsterPortraitUrl(monster.model_id)
  const pen = formatMonsterPenName(monster.pen_name)
  const locations = useMemo(
    () => dedupeMonsterLocations(monster.locations ?? []),
    [monster.locations],
  )
  const dropGroups = useMemo(() => groupMonsterDropsByType(monster.drops ?? []), [monster.drops])

  return (
    <div className="guidebook-monster-panel" onMouseDown={(e) => e.stopPropagation()}>
      <header className="guidebook-monster-panel__header">
        <div className="guidebook-monster-panel__portrait-wrap">
          {portrait ? (
            <img className="guidebook-monster-panel__portrait" src={portrait} alt="" width={56} height={56} />
          ) : null}
        </div>
        <div className="guidebook-monster-panel__head-text">
          <h3 className="guidebook-monster-panel__name">
            {monster.name}{' '}
            <span className="guidebook-monster-panel__level">[Lv.{monster.level}]</span>
          </h3>
          {pen ? <p className="guidebook-monster-panel__pen">{pen}</p> : null}
        </div>
        <GuidebookWikiPanelNav canGoBack={canGoBack} onBack={onBack} onClose={onClose} />
      </header>

      <div className="guidebook-monster-panel__body">
        {monster.exp != null || monster.bits != null ? (
          <div className="guidebook-monster-panel__stats">
            {monster.exp != null ? (
              <div className="guidebook-monster-panel__stat">
                <span className="guidebook-monster-panel__stat-value">
                  {monster.exp.toLocaleString()}{' '}
                  <span className="guidebook-monster-panel__stat-tag guidebook-monster-panel__stat-tag--exp">
                    EXP
                  </span>
                </span>
              </div>
            ) : null}
            {monster.bits != null ? (
              <div className="guidebook-monster-panel__stat">
                <span className="guidebook-monster-panel__stat-value guidebook-monster-panel__stat-value--bits">
                  {monster.bits.toLocaleString()}{' '}
                  <span className="guidebook-monster-panel__stat-tag guidebook-monster-panel__stat-tag--bits">
                    B
                  </span>
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        {locations.length > 0 ? (
          <section className="guidebook-monster-panel__section">
            <h4 className="guidebook-monster-panel__sh">Spawn locations</h4>
            <div className="guidebook-monster-panel__chips">
              {locations.map((loc) => (
                <span key={loc.map_id || loc.map_name} className="guidebook-monster-panel__chip">
                  {loc.map_name}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {dropGroups.length > 0 ? (
          <section className="guidebook-monster-panel__section">
            <h4 className="guidebook-monster-panel__sh">Loot table</h4>
            <div className="guidebook-monster-panel__loot-groups">
              {dropGroups.map((group) => (
                <div key={group.type} className="guidebook-monster-panel__loot-group">
                  <div className="guidebook-monster-panel__loot-group-label">{group.label}</div>
                  <ul className="guidebook-monster-panel__loot-list">
                    {group.items.map((drop) => (
                      <li key={`${drop.item_id}-${drop.item_name}`} className="guidebook-monster-panel__loot-row">
                        <GuidebookItemLootButton
                          itemId={drop.item_id}
                          itemName={drop.item_name}
                          iconId={drop.item_icon_id}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}

export function GuidebookDigimonProfilePanel({
  digimon,
  canGoBack,
  onBack,
  onClose,
}: {
  digimon: WikiDigimonDetail
  canGoBack?: boolean
  onBack?: () => void
  onClose: () => void
}) {
  const { pushDigimon } = useGuidebookWikiOverlay()
  const portrait = digimonPortraitUrl(digimon.model_id, digimon.id, digimon.name)
  const statRows = useMemo(() => wikiCombatStatRows(digimon.stats), [digimon.stats])
  const skills = digimon.skills ?? []

  return (
    <div className="guidebook-digimon-panel" onMouseDown={(e) => e.stopPropagation()}>
      <article className="guidebook-digimon-panel__card" aria-label={`${digimon.name} profile`}>
        <header className="guidebook-digimon-panel__header">
          <div
            className="guidebook-digimon-panel__portrait-wrap"
            style={{ background: digimonStagePortraitGradient(digimon.stage) }}
          >
            {portrait ? (
              <img
                className="guidebook-digimon-panel__portrait"
                src={portrait}
                alt=""
                width={72}
                height={72}
              />
            ) : null}
            {digimon.rank > 0 ? (
              <span className="guidebook-digimon-panel__rank" aria-hidden="true">
                <span style={rankSpriteStyle(digimon.rank)} />
              </span>
            ) : null}
          </div>
          <div className="guidebook-digimon-panel__head-text">
            <h3 className="guidebook-digimon-panel__name">{digimon.name}</h3>
            <p className="guidebook-digimon-panel__stage">{digimon.stage}</p>
            <div className="guidebook-digimon-panel__pills">
              <span className="guidebook-digimon-panel__pill">{digimon.attribute || 'None'}</span>
              <span className="guidebook-digimon-panel__pill">{digimon.element || 'None'}</span>
            </div>
            <p className="guidebook-digimon-panel__meta">
              {digimon.role || 'None'}
              {(digimon.family_types ?? []).length
                ? ` · ${(digimon.family_types ?? []).join(', ')}`
                : ''}
            </p>
          </div>
          <GuidebookWikiPanelNav canGoBack={canGoBack} onBack={onBack} onClose={onClose} />
        </header>
      </article>

      <div className="guidebook-digimon-panel__body">
        {statRows.length > 0 ? (
          <section className="guidebook-digimon-panel__section">
            <h4 className="guidebook-digimon-panel__sh">Combat stats</h4>
            <div className="stats-grid">
              {statRows.map(([label, val]) => (
                <div key={label} className="stat-cell">
                  <span className="stat-label">{label}</span>
                  <span className="stat-val">
                    {typeof val === 'number' ? val.toLocaleString() : val}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {skills.length > 0 ? (
          <section className="guidebook-digimon-panel__section">
            <h4 className="guidebook-digimon-panel__sh">Skills ({skills.length})</h4>
            <ul className="guidebook-digimon-panel__skill-list">
              {skills.map((skill) => (
                <GuidebookDigimonSkillRow key={skill.id} skill={skill} />
              ))}
            </ul>
          </section>
        ) : null}

        <section className="guidebook-digimon-panel__section guidebook-digimon-panel__section--evo">
          <EvolutionTree
            tree={digimon.evolution_tree}
            currentDigimonId={digimon.id}
            onDigimonClick={pushDigimon}
          />
        </section>

        <p className="guidebook-digimon-panel__full-link">
          <Link to={`/digimon/${digimon.id}`} className="guidebook-btn guidebook-btn--accent guidebook-btn--small">
            Full profile
          </Link>
        </p>
      </div>
    </div>
  )
}
