export type RaidTimerBoss = {
  monster_id: string
  monster_name: string
  model_id: string
  level: number
  map_id: string
  map_name: string
  status: string
  next_spawn_ts: number
  respawn_sec: number
  despawn_sec: number
  count: number
  cross_channel: boolean
}

export type RaidTimerResponse = {
  now: number
  live: boolean
  bosses: RaidTimerBoss[]
}
