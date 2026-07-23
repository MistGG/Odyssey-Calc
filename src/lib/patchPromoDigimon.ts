export type PromoObtainKind = 'shop' | 'farm' | 'quest'

export type PromoObtainMethod = {
  kind: PromoObtainKind
  detail: string
}

export type PromoLineForm = {
  id: string
  name: string
  /** Filename under `public/promo/new-century/` */
  image: string
}

export type PromoEntry = {
  id: string
  name: string
  status?: 'pending'
  line: PromoLineForm[]
  methods: PromoObtainMethod[]
  /** Shown when status is pending and methods are empty */
  pendingNote?: string
  /** Larger showcase treatment in the featured row */
  featured?: boolean
}

export function promoNcImage(file: string): string {
  return `${import.meta.env.BASE_URL}promo/new-century/${file}`
}

const VERDANDI_LINE_FARM: PromoObtainMethod = {
  kind: 'farm',
  detail: 'Verdandi overworld & dailies ticket farm · F2P (+ other methods)',
}

export const PATCH_PROMO_ENTRIES: PromoEntry[] = [
  {
    id: 'omegamon',
    name: 'Omegamon',
    featured: true,
    line: [{ id: 'omegamon', name: 'Omegamon', image: 'omegamon.png' }],
    methods: [
      { kind: 'shop', detail: 'Gacha · tradable' },
      { kind: 'farm', detail: 'Dungeon farm (unlocked via quest) · F2P' },
    ],
  },
  {
    id: 'ulforce-veemon-x',
    name: 'Ulforce Veemon X',
    featured: true,
    line: [
      {
        id: 'ulforce-veemon-x',
        name: 'Ulforce Veemon X',
        image: 'ulforce-veemon-x.png',
      },
    ],
    methods: [
      { kind: 'shop', detail: 'Gacha · tradable' },
      { kind: 'quest', detail: 'Verdandi questline · non-tradable' },
      { kind: 'farm', detail: 'Verdandi overworld farm · tradable' },
    ],
  },
  {
    id: 'alphamon-ouryuken',
    name: 'Alphamon Ouryuken',
    featured: true,
    line: [
      {
        id: 'alphamon-ouryuken',
        name: 'Alphamon Ouryuken',
        image: 'alphamon-ouryuken.png',
      },
    ],
    methods: [
      { kind: 'shop', detail: 'Gacha (1st item) · tradable' },
      { kind: 'farm', detail: 'Verdandi overworld (2nd item) · non-tradable' },
    ],
  },
  {
    id: 'wargreymon-x-line',
    name: 'WarGreymon X',
    line: [
      { id: 'agumon-x', name: 'Agumon X', image: 'agumon-x.png' },
      { id: 'greymon-x', name: 'Greymon X', image: 'greymon-x.png' },
      { id: 'metalgreymon-x', name: 'MetalGreymon X', image: 'metalgreymon-x.png' },
      { id: 'wargreymon-x', name: 'WarGreymon X', image: 'wargreymon-x.png' },
    ],
    methods: [VERDANDI_LINE_FARM],
  },
  {
    id: 'metalgarurumon-x-line',
    name: 'MetalGarurumon X',
    line: [
      { id: 'gabumon-x', name: 'Gabumon X', image: 'gabumon-x.png' },
      { id: 'garurumon-x', name: 'Garurumon X', image: 'garurumon-x.png' },
      {
        id: 'weregarurumon-x',
        name: 'WereGarurumon X',
        image: 'weregarurumon-x.png',
      },
      {
        id: 'metalgarurumon-x',
        name: 'MetalGarurumon X',
        image: 'metalgarurumon-x.png',
      },
    ],
    methods: [VERDANDI_LINE_FARM],
  },
  {
    id: 'rosemon-x-line',
    name: 'Rosemon X',
    line: [
      { id: 'palmon-x', name: 'Palmon X', image: 'palmon-x.png' },
      { id: 'togemon-x', name: 'Togemon X', image: 'togemon-x.png' },
      { id: 'lillymon-x', name: 'Lillymon X', image: 'lillymon-x.png' },
      { id: 'rosemon-x', name: 'Rosemon X', image: 'rosemon-x.png' },
    ],
    methods: [VERDANDI_LINE_FARM],
  },
  {
    id: 'wargrowlmon-line',
    name: 'WarGrowlmon',
    line: [
      { id: 'guilmon-x', name: 'Guilmon X', image: 'guilmon-x.png' },
      { id: 'growlmon-x', name: 'Growlmon X', image: 'growlmon-x.png' },
      { id: 'wargrowlmon-x', name: 'WarGrowlmon X', image: 'wargrowlmon-x.png' },
    ],
    methods: [VERDANDI_LINE_FARM],
  },
]

export const PROMO_OBTAIN_LABELS: Record<PromoObtainKind, string> = {
  shop: 'Shop',
  farm: 'Farm',
  quest: 'Quest',
}

export function promoFeaturedEntries() {
  return PATCH_PROMO_ENTRIES.filter((e) => e.featured)
}

export function promoLineEntries() {
  return PATCH_PROMO_ENTRIES.filter((e) => !e.featured)
}
