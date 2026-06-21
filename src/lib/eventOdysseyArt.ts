type EventBackdropSpiritId =
  | 'examon'
  | 'slayerdramon'
  | 'breakdramon'
  | 'jupitermon'
  | 'marsmon'
  | 'apollomon'

const EVENT_BACKDROP_SRC = import.meta.glob<string>('../assets/event-backdrop/*.png', {
  eager: true,
  import: 'default',
})

function eventBackdropArtUrl(id: EventBackdropSpiritId): string | undefined {
  return EVENT_BACKDROP_SRC[`../assets/event-backdrop/${id}.png`]
}

export type EventBackdropSpiritSlot =
  | 'far-left'
  | 'far-right'
  | 'mid-left'
  | 'mid-right'
  | 'low-left'
  | 'low-right'

/**
 * Dragon Emperor event backdrop — Time Stranger model art from Wikimon
 * (regenerate via `node scripts/process-event-backdrop-spirits.mjs`).
 */
export const EVENT_BACKDROP_SPIRITS: { id: EventBackdropSpiritId; slot: EventBackdropSpiritSlot }[] = [
  { id: 'examon', slot: 'far-left' },
  { id: 'slayerdramon', slot: 'far-right' },
  { id: 'breakdramon', slot: 'mid-left' },
  { id: 'jupitermon', slot: 'mid-right' },
  { id: 'marsmon', slot: 'low-left' },
  { id: 'apollomon', slot: 'low-right' },
]

export function eventBackdropSpiritUrl(id: EventBackdropSpiritId): string | undefined {
  return eventBackdropArtUrl(id)
}
