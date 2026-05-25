import type { RaidTimerResponse } from '../types/raidTimerApi'
import { fetchJson } from './http'

const PROXY_ORIGIN = 'https://odyssey-proxy.qawsar-ahmed.workers.dev/proxy'

export function raidTimerApiUrl(): string {
  if (import.meta.env.DEV) {
    return '/api/raid-timer'
  }
  return `${PROXY_ORIGIN}/api/raid-timer`
}

export async function fetchRaidTimer(): Promise<RaidTimerResponse> {
  return fetchJson<RaidTimerResponse>(raidTimerApiUrl())
}
