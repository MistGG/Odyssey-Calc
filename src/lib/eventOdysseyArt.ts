type OlympusArtId =
  | 'apollomon'
  | 'bacchusmon'
  | 'ceresmon'
  | 'dianamon'
  | 'junomon'
  | 'jupitermon'
  | 'marsmon'
  | 'mercurymon'
  | 'minervamon'
  | 'neptunemon'
  | 'venusmon'
  | 'vulcanusmon'

const OLYMPUS_OVERLAY_SRC = import.meta.glob<string>('../assets/meter-themes/olympus/*.png', {
  eager: true,
  import: 'default',
})

function olympusArtUrl(id: OlympusArtId): string | undefined {
  return OLYMPUS_OVERLAY_SRC[`../assets/meter-themes/olympus/${id}.png`]
}

export type EventBackdropSpiritSlot =
  | 'far-left'
  | 'far-right'
  | 'mid-left'
  | 'mid-right'
  | 'low-left'
  | 'low-right'

/** Olympos XII spirits spread across the page backdrop. */
export const EVENT_BACKDROP_SPIRITS: { id: OlympusArtId; slot: EventBackdropSpiritSlot }[] = [
  { id: 'vulcanusmon', slot: 'far-left' },
  { id: 'jupitermon', slot: 'far-right' },
  { id: 'marsmon', slot: 'mid-left' },
  { id: 'apollomon', slot: 'mid-right' },
  { id: 'minervamon', slot: 'low-left' },
  { id: 'ceresmon', slot: 'low-right' },
]

export function eventBackdropSpiritUrl(id: OlympusArtId): string | undefined {
  return olympusArtUrl(id)
}
