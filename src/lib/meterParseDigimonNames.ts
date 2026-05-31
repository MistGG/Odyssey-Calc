import { fetchDigimonDetail } from '../api/digimonService'

import { digimonPortraitUrl } from './digimonImage'
import {
  isDungeonPartyParsePayload,
  type MeterParsePayloadDungeonPartyStored,
  type MeterPartyMemberStored,
} from './meterParsePayload'
import { mapPool } from './meterPlayerProfile'

const nameCache = new Map<string, { name: string; modelId: string }>()

function normId(id: string): string {
  return id.trim().toLowerCase()
}

/** True when companion stored stream nicknames; site should resolve via wiki `digimon_id`. */
export function parsePayloadNeedsDigimonWikiResolution(payload: unknown): boolean {
  if (!isDungeonPartyParsePayload(payload)) return false
  if (payload.digimonNamesRequireWikiLookup === false) return false
  if (payload.digimonNamesRequireWikiLookup === true) return true
  // Legacy rows uploaded before the flag existed (may still store in-game nicknames).
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

export async function fetchOfficialDigimonInfoByIds(
  digimonIds: string[],
): Promise<Map<string, { name: string; modelId: string }>> {
  const unique = [...new Set(digimonIds.map((id) => id.trim()).filter(Boolean))]
  const out = new Map<string, { name: string; modelId: string }>()

  await mapPool(unique, 10, async (id) => {
    const key = normId(id)
    const cached = nameCache.get(key)
    if (cached) {
      out.set(id, cached)
      return
    }
    try {
      const detail = await fetchDigimonDetail(id)
      const name = detail.name?.trim()
      const modelId = detail.model_id?.trim() ?? ''
      if (name) {
        const entry = { name, modelId }
        nameCache.set(key, entry)
        out.set(id, entry)
      }
    } catch {
      /* skip unresolved */
    }
  })

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
    dg.digimonName = officialName
    if (modelId) {
      dg.iconId = modelId
      dg.portraitUrl = digimonPortraitUrl(modelId, dg.digimonId, officialName)
    }
  }
  if (member.currentDigimonId?.trim() && normId(member.currentDigimonId) === idKey) {
    member.currentDigimonName = officialName
    if (modelId) {
      member.portraitIconId = modelId
      member.portraitUrl = digimonPortraitUrl(modelId, digimonId, officialName)
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

export async function resolveDungeonPartyPayloadDigimonNames(
  payload: unknown,
): Promise<unknown> {
  if (!isDungeonPartyParsePayload(payload)) return payload
  if (!parsePayloadNeedsDigimonWikiResolution(payload)) return payload
  const ids = collectDigimonIdsFromPayload(payload)
  if (!ids.length) return payload
  const officialById = await fetchOfficialDigimonInfoByIds(ids)
  if (!officialById.size) return payload
  return applyWikiDigimonNamesToPayload(payload, officialById)
}

export async function resolveMeterParseRowPayloads<T extends { payload: unknown }>(
  rows: T[],
): Promise<T[]> {
  const needs = rows.filter((r) => parsePayloadNeedsDigimonWikiResolution(r.payload))
  if (!needs.length) return rows

  const idSet = new Set<string>()
  for (const row of needs) {
    if (!isDungeonPartyParsePayload(row.payload)) continue
    for (const id of collectDigimonIdsFromPayload(row.payload)) idSet.add(id)
  }
  const officialById = await fetchOfficialDigimonInfoByIds([...idSet])
  if (!officialById.size) return rows

  return rows.map((row) => {
    if (!parsePayloadNeedsDigimonWikiResolution(row.payload)) return row
    if (!isDungeonPartyParsePayload(row.payload)) return row
    return {
      ...row,
      payload: applyWikiDigimonNamesToPayload(row.payload, officialById),
    }
  })
}
