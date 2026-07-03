import { digimonPortraitUrl } from './digimonImage'
import { resolveEffectiveDigimonIdentity } from './resolveDigimonAlternateStructure'
import { reattributePayloadMembersFromSkills } from './meterDigimonSkillResolve'
import {
  isDungeonPartyParsePayload,
  type MeterParsePayloadDungeonPartyStored,
  type MeterPartyMemberStored,
} from './meterParsePayload'
import { fetchWikiDigimonCatalog, METER_ROLE_BUCKETS, memberTopDigimonUsed } from './meterRoleBuckets'
import type { DigimonBarEntry, MeterPublicAggregates, PlayerRankEntry } from './meterPublicStats'

function normId(id: string): string {
  return id.trim().toLowerCase()
}

/** True when companion stored stream nicknames; site should resolve via wiki `digimon_id`. */
export function parsePayloadNeedsDigimonWikiResolution(payload: unknown): boolean {
  if (!isDungeonPartyParsePayload(payload)) return false
  if (payload.digimonNamesRequireWikiLookup === false) return false
  if (payload.digimonNamesRequireWikiLookup === true) return true
  return collectDigimonIdsFromPayload(payload).length > 0
}

function collectDigimonIdsFromPayload(payload: MeterParsePayloadDungeonPartyStored): string[] {
  const ids = new Set<string>()
  for (const member of payload.members) {
    const cur = member.currentDigimonId?.trim()
    if (cur) ids.add(cur)
    for (const dg of member.digimons ?? []) {
      const id = dg.digimonId?.trim()
      if (id && id !== 'unknown') ids.add(id)
    }
  }
  return [...ids]
}

async function preparePayloadDigimonAttribution(
  payload: MeterParsePayloadDungeonPartyStored,
): Promise<MeterParsePayloadDungeonPartyStored> {
  const next = structuredClone(payload)
  await reattributePayloadMembersFromSkills(next)
  return next
}

/** Resolve official names from the bulk wiki catalog (no per-id API calls). */
export async function fetchOfficialDigimonInfoByIds(
  digimonIds: string[],
): Promise<Map<string, { name: string; modelId: string }>> {
  const unique = [...new Set(digimonIds.map((id) => id.trim()).filter(Boolean))]
  const out = new Map<string, { name: string; modelId: string }>()
  if (!unique.length) return out

  let catalog: Awaited<ReturnType<typeof fetchWikiDigimonCatalog>>
  try {
    catalog = await fetchWikiDigimonCatalog()
  } catch {
    return out
  }

  const byNorm = new Map<string, { id: string; name: string; modelId: string }>()
  for (const [id, entry] of catalog) {
    if (!entry.name) continue
    byNorm.set(normId(id), { id, name: entry.name, modelId: entry.modelId })
  }

  for (const id of unique) {
    const hit = byNorm.get(normId(id))
    if (hit) out.set(id, { name: hit.name, modelId: hit.modelId })
  }

  return out
}

function applyOfficialNameToMember(
  member: MeterPartyMemberStored,
  digimonId: string,
  officialName: string,
  modelId: string,
): void {
  const idKey = normId(digimonId)
  for (const dg of member.digimons ?? []) {
    if (normId(dg.digimonId) !== idKey) continue
    const currentIcon = dg.iconId?.trim() || ''
    const onAlternateIcon = Boolean(currentIcon && modelId && currentIcon !== modelId)
    if (!onAlternateIcon) {
      dg.digimonName = officialName
      if (modelId) {
        dg.iconId = modelId
        dg.portraitUrl = digimonPortraitUrl(modelId, dg.digimonId, officialName)
      }
    }
  }
  if (member.currentDigimonId?.trim() && normId(member.currentDigimonId) === idKey) {
    const currentIcon = member.portraitIconId?.trim() || ''
    const onAlternateIcon = Boolean(currentIcon && modelId && currentIcon !== modelId)
    if (!onAlternateIcon) {
      member.currentDigimonName = officialName
      if (modelId) {
        member.portraitIconId = modelId
        member.portraitUrl = digimonPortraitUrl(modelId, digimonId, officialName)
      }
    }
  }
}

/** Returns a new payload with wiki species names applied; clears the lookup flag when done. */
export function applyWikiDigimonNamesToPayload(
  payload: MeterParsePayloadDungeonPartyStored,
  officialById: Map<string, { name: string; modelId: string }>,
): MeterParsePayloadDungeonPartyStored {
  const next: MeterParsePayloadDungeonPartyStored = structuredClone(payload)
  for (const member of next.members) {
    for (const [digimonId, info] of officialById) {
      applyOfficialNameToMember(member, digimonId, info.name, info.modelId)
    }
  }
  next.digimonNamesRequireWikiLookup = false
  return next
}

function applyAlternateStructureToMember(
  member: MeterPartyMemberStored,
  partyMembers: MeterPartyMemberStored[],
  effective: Awaited<ReturnType<typeof resolveEffectiveDigimonIdentity>>,
): void {
  if (!effective.isAlternateStructure) return
  const top = memberTopDigimonUsed(member, undefined, partyMembers)
  if (!top) return
  const parentId = effective.parentDigimonId?.trim() || top.digimonId.trim()
  for (const dg of member.digimons ?? []) {
    if (dg.digimonId?.trim() !== parentId) continue
    dg.digimonName = effective.digimonName
    if (effective.iconId) {
      dg.iconId = effective.iconId
      dg.portraitUrl = digimonPortraitUrl(effective.iconId, effective.digimonId, effective.digimonName)
    }
  }
  if ((member.currentDigimonId?.trim() || '') === parentId) {
    member.currentDigimonName = effective.digimonName
    if (effective.iconId) {
      member.portraitIconId = effective.iconId
      member.portraitUrl = digimonPortraitUrl(
        effective.iconId,
        effective.digimonId,
        effective.digimonName,
      )
    }
  }
}

/** Resolve Alternate Structure Module portraits to override species names/roles. */
export async function resolveAlternateStructureInPayload(
  payload: MeterParsePayloadDungeonPartyStored,
): Promise<MeterParsePayloadDungeonPartyStored> {
  const next: MeterParsePayloadDungeonPartyStored = structuredClone(payload)
  await Promise.all(
    next.members.map(async (member) => {
      const top = memberTopDigimonUsed(member, undefined, next.members)
      if (!top?.digimonId) return
      const effective = await resolveEffectiveDigimonIdentity({
        digimonId: top.digimonId,
        iconId: top.iconId,
        digimonName: top.digimonName,
      })
      applyAlternateStructureToMember(member, next.members, effective)
    }),
  )
  return next
}

export async function resolveDungeonPartyPayloadDigimonNames(
  payload: unknown,
): Promise<unknown> {
  if (!isDungeonPartyParsePayload(payload)) return payload
  const attributed = await preparePayloadDigimonAttribution(payload)
  let next = attributed
  if (parsePayloadNeedsDigimonWikiResolution(attributed)) {
    const ids = collectDigimonIdsFromPayload(attributed)
    if (ids.length) {
      const officialById = await fetchOfficialDigimonInfoByIds(ids)
      if (officialById.size) next = applyWikiDigimonNamesToPayload(attributed, officialById)
    }
  }
  return resolveAlternateStructureInPayload(next)
}

export async function resolveMeterParseRowPayloads<T extends { payload: unknown }>(
  rows: T[],
): Promise<T[]> {
  const dungeonRows = rows.filter((r) => isDungeonPartyParsePayload(r.payload))
  if (!dungeonRows.length) return rows

  const attributedRows = await Promise.all(
    rows.map(async (row) => {
      if (!isDungeonPartyParsePayload(row.payload)) return row
      return {
        ...row,
        payload: await preparePayloadDigimonAttribution(row.payload),
      }
    }),
  )

  const needsWiki = attributedRows.filter((r) => parsePayloadNeedsDigimonWikiResolution(r.payload))
  const idSet = new Set<string>()
  for (const row of needsWiki) {
    if (!isDungeonPartyParsePayload(row.payload)) continue
    for (const id of collectDigimonIdsFromPayload(row.payload)) idSet.add(id)
  }

  const officialById = idSet.size ? await fetchOfficialDigimonInfoByIds([...idSet]) : new Map()

  const withWikiNames = attributedRows.map((row) => {
    if (!isDungeonPartyParsePayload(row.payload)) return row
    let payload = row.payload
    if (parsePayloadNeedsDigimonWikiResolution(payload) && officialById.size) {
      payload = applyWikiDigimonNamesToPayload(payload, officialById)
    }
    return {
      ...row,
      payload,
    }
  })

  return Promise.all(
    withWikiNames.map(async (row) => {
      if (!isDungeonPartyParsePayload(row.payload)) return row
      return {
        ...row,
        payload: await resolveAlternateStructureInPayload(row.payload),
      }
    }),
  )
}

function applyOfficialNameToRankEntry(
  entry: PlayerRankEntry,
  officialById: Map<string, { name: string; modelId: string }>,
): PlayerRankEntry {
  const id = entry.digimonId.trim()
  if (!id) return entry
  const info = officialById.get(id)
  if (!info?.name) return entry
  const currentIcon = entry.iconId?.trim() || ''
  const onAlternateIcon = Boolean(currentIcon && info.modelId && currentIcon !== info.modelId)
  return {
    ...entry,
    digimonName: onAlternateIcon ? entry.digimonName : info.name,
    iconId: onAlternateIcon ? entry.iconId : info.modelId || entry.iconId,
    portraitUrl: onAlternateIcon
      ? entry.portraitUrl
      : info.modelId
        ? digimonPortraitUrl(info.modelId, id, info.name)
        : entry.portraitUrl,
  }
}

function applyOfficialNameToDigimonBar(
  entry: DigimonBarEntry,
  officialById: Map<string, { name: string; modelId: string }>,
): DigimonBarEntry {
  const id = entry.digimonId.trim()
  if (!id) return entry
  const info = officialById.get(id)
  if (!info?.name) return entry
  const currentIcon = entry.iconId?.trim() || ''
  const onAlternateIcon = Boolean(currentIcon && info.modelId && currentIcon !== info.modelId)
  return {
    ...entry,
    digimonName: onAlternateIcon ? entry.digimonName : info.name,
    iconId: onAlternateIcon ? entry.iconId : info.modelId || entry.iconId,
    portraitUrl: onAlternateIcon
      ? entry.portraitUrl
      : info.modelId
        ? digimonPortraitUrl(info.modelId, id, info.name)
        : entry.portraitUrl,
  }
}

export async function applyOfficialNamesToMeterAggregates(
  stats: MeterPublicAggregates,
): Promise<MeterPublicAggregates> {
  const idSet = new Set<string>()
  for (const bucket of METER_ROLE_BUCKETS) {
    for (const entry of stats.playersByBucket[bucket]) {
      const id = entry.digimonId.trim()
      if (id) idSet.add(id)
    }
    for (const entry of stats.digimonByBucketBest[bucket]) {
      const id = entry.digimonId.trim()
      if (id) idSet.add(id)
    }
    for (const entry of stats.digimonByBucketAverage[bucket]) {
      const id = entry.digimonId.trim()
      if (id) idSet.add(id)
    }
  }
  if (!idSet.size) return stats

  const officialById = await fetchOfficialDigimonInfoByIds([...idSet])
  if (!officialById.size) return stats

  const playersByBucket = { ...stats.playersByBucket }
  const digimonByBucketBest = { ...stats.digimonByBucketBest }
  const digimonByBucketAverage = { ...stats.digimonByBucketAverage }

  for (const bucket of METER_ROLE_BUCKETS) {
    playersByBucket[bucket] = stats.playersByBucket[bucket].map((e) =>
      applyOfficialNameToRankEntry(e, officialById),
    )
    digimonByBucketBest[bucket] = stats.digimonByBucketBest[bucket].map((e) =>
      applyOfficialNameToDigimonBar(e, officialById),
    )
    digimonByBucketAverage[bucket] = stats.digimonByBucketAverage[bucket].map((e) =>
      applyOfficialNameToDigimonBar(e, officialById),
    )
  }

  return {
    ...stats,
    playersByBucket,
    digimonByBucketBest,
    digimonByBucketAverage,
  }
}

export async function applyOfficialNamesToPlayerRankEntries(
  entries: PlayerRankEntry[],
): Promise<PlayerRankEntry[]> {
  const ids = [...new Set(entries.map((e) => e.digimonId.trim()).filter(Boolean))]
  if (!ids.length) return entries
  const officialById = await fetchOfficialDigimonInfoByIds(ids)
  if (!officialById.size) return entries
  return entries.map((e) => applyOfficialNameToRankEntry(e, officialById))
}
