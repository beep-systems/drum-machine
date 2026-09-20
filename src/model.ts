export const TRACKS = [
  { id: 'kick', name: 'Бочка', short: 'BD', color: '#c2ef72', gain: 0.9 },
  { id: 'snare', name: 'Малый', short: 'SN', color: '#e8bb7d', gain: 0.8 },
  {
    id: 'closedHat',
    name: 'Закрытый хэт',
    short: 'CH',
    color: '#8bbfb0',
    gain: 0.52,
  },
  { id: 'openHat', name: 'Открытый хэт', short: 'OH', color: '#8bbfb0', gain: 0.48 },
  { id: 'crash', name: 'Крэш', short: 'CR', color: '#b5a4d8', gain: 0.55 },
  { id: 'ride', name: 'Райд', short: 'RD', color: '#b5a4d8', gain: 0.55 },
  { id: 'highTom', name: 'Высокий том', short: 'HT', color: '#d49688', gain: 0.72 },
  { id: 'lowTom', name: 'Низкий том', short: 'LT', color: '#d49688', gain: 0.8 },
] as const

export type TrackId = (typeof TRACKS)[number]['id']
export type Step = 0 | 1 | 2
export type Pattern = { name: string; tracks: Record<TrackId, Step[]> }
export type Mixer = Record<TrackId, { volume: number; muted: boolean }>
export type KitId = 'acoustic' | 'industrial'
export const isKitId = (v: unknown): v is KitId => v === 'acoustic' || v === 'industrial'
export const KITS: Record<KitId, Record<TrackId, string[]>> = {
  acoustic: {
    kick: ['kick-1', 'kick-2'],
    snare: ['snare-1', 'snare-2'],
    closedHat: ['closed-hat'],
    openHat: ['open-hat'],
    crash: ['crash'],
    ride: ['ride'],
    highTom: ['high-tom'],
    lowTom: ['low-tom'],
  },
  industrial: {
    kick: ['industrial/kick'],
    snare: ['industrial/snare'],
    closedHat: ['industrial/closed-hat'],
    openHat: ['industrial/open-hat'],
    crash: ['industrial/crash'],
    ride: ['industrial/ride'],
    highTom: ['industrial/high-tom'],
    lowTom: ['industrial/low-tom'],
  },
}
export type Session = {
  kitId?: KitId
  pattern: Pattern
  bpm: number
  master: number
  countIn: boolean
  mixer: Mixer
}
export type SavedPattern = { kitId?: KitId; id: string; pattern: Pattern; bpm: number }
export type PresetCategory = 'basic' | 'rock' | 'hard-rock' | 'metal' | 'songs' | 'industrial'
export type Preset = SavedPattern & { category: PresetCategory; description: string }
export type AppState = { version: 1; session: Session; library: SavedPattern[] }
export const STEPS = 32

export function emptyPattern(name: string): Pattern {
  return {
    name,
    tracks: Object.fromEntries(TRACKS.map((t) => [t.id, Array<Step>(STEPS).fill(0)])) as Pattern['tracks'],
  }
}

function preset(
  name: string,
  bpm: number,
  categoryOrHits: PresetCategory | Partial<Record<TrackId, number[]>>,
  hitsOrDescription: Partial<Record<TrackId, number[]>> | string = {},
  description = '',
): Preset {
  const category = typeof categoryOrHits === 'string' ? categoryOrHits : 'basic'
  const hits =
    typeof categoryOrHits === 'string'
      ? (hitsOrDescription as Partial<Record<TrackId, number[]>>)
      : categoryOrHits
  const note = typeof categoryOrHits === 'string' ? description : ''
  const pattern = emptyPattern(name)
  for (const track of TRACKS) {
    for (const step of hits[track.id] ?? []) pattern.tracks[track.id][step] = 1
  }
  for (const step of [0, 16]) if (pattern.tracks.kick[step]) pattern.tracks.kick[step] = 2
  const result = { id: name, bpm, pattern } as Preset
  Object.defineProperties(result, {
    category: { value: category, enumerable: false },
    description: { value: note, enumerable: false },
  })
  return result
}
const every = (n: number) => Array.from({ length: STEPS / n }, (_, i) => i * n)

const BASE_PRESETS = [
  preset('Базовый рок', 100, { kick: [0, 8, 16, 24, 26], snare: [4, 12, 20, 28], closedHat: every(2) }),
  preset('Хард-рок', 120, {
    kick: [0, 3, 8, 10, 16, 19, 24, 26],
    snare: [4, 12, 20, 28],
    closedHat: every(2).filter((s) => s !== 30),
    openHat: [30],
    crash: [0],
  }),
  preset('Half-time', 80, { kick: [0, 6, 14, 16, 22, 27], snare: [8, 24], closedHat: every(2), crash: [0] }),
  preset('Двойная бочка', 140, { kick: every(1), snare: [4, 12, 20, 28], closedHat: every(2), crash: [0] }),
  preset('Thrash', 180, {
    kick: every(4).flatMap((s) => [s, s + 2]),
    snare: [4, 12, 20, 28],
    ride: every(2),
    crash: [0],
    highTom: [29],
    lowTom: [30, 31],
  }),
  preset('Blast beat', 200, {
    kick: every(2),
    snare: every(2).map((s) => s + 1),
    ride: every(2),
    crash: [0],
  }),
]

const EXTRA_PRESETS: Preset[] = [
  preset('Straight Rock', 96, 'rock', {
    kick: [0, 8, 16, 24],
    snare: [4, 12, 20, 28],
    closedHat: every(2),
    crash: [0, 16],
  }),
  preset('Rock Syncopation', 108, 'rock', {
    kick: [0, 6, 8, 16, 22, 24],
    snare: [4, 12, 20, 28],
    closedHat: every(2),
    openHat: [14, 30],
  }),
  preset('Rock Ballad', 72, 'rock', {
    kick: [0, 10, 16, 22],
    snare: [8, 24],
    closedHat: every(2),
    crash: [0],
  }),
  preset('Shuffle Rock', 112, 'rock', {
    kick: [0, 6, 8, 16, 22, 24],
    snare: [4, 12, 20, 28],
    ride: every(2),
  }),
  preset('Hard Rock Groove', 126, 'hard-rock', {
    kick: [0, 3, 8, 10, 16, 19, 24, 27],
    snare: [4, 12, 20, 28],
    closedHat: every(2),
    crash: [0, 16],
  }),
  preset('Gallop', 132, 'hard-rock', {
    kick: [0, 2, 4, 8, 10, 12, 16, 18, 20, 24, 26, 28],
    snare: [4, 12, 20, 28],
    ride: every(2),
  }),
  preset('Tom Transition', 118, 'hard-rock', {
    kick: [0, 8, 16, 24],
    snare: [4, 12, 20],
    closedHat: every(2),
    highTom: [26, 28, 30],
    lowTom: [27, 29, 31],
  }),
  preset('Metal March', 150, 'metal', {
    kick: [0, 4, 8, 12, 16, 20, 24, 28],
    snare: [4, 12, 20, 28],
    ride: every(2),
    crash: [0, 16],
  }),
  preset('Melodic Metal', 156, 'metal', {
    kick: [0, 3, 8, 11, 16, 19, 24, 27],
    snare: [4, 12, 20, 28],
    closedHat: every(2),
    crash: [0, 16],
  }),
  preset('Death Metal', 190, 'metal', {
    kick: every(2),
    snare: every(4).map((s) => s + 2),
    ride: every(2),
    crash: [0],
  }),
  preset('Tom Finale', 170, 'metal', {
    kick: [0, 4, 8, 12, 16, 20, 24],
    snare: [4, 12, 20],
    ride: every(2),
    highTom: [26, 28, 30],
    lowTom: [27, 29, 31],
  }),
  preset(
    'Stadium Rock Style',
    104,
    'songs',
    { kick: [0, 8, 16, 24], snare: [4, 12, 20, 28], closedHat: every(2), crash: [0, 8, 16, 24] },
    'Song-style interpretation, not an audio transcription.',
  ),
  preset(
    'Hard Rock Riff Style',
    116,
    'songs',
    { kick: [0, 3, 8, 10, 16, 19, 24, 26], snare: [4, 12, 20, 28], closedHat: every(2), openHat: [14, 30] },
    'Song-style interpretation of riff-driven hard rock.',
  ),
  preset(
    'Blues Rock Style',
    92,
    'songs',
    { kick: [0, 6, 8, 16, 22, 24], snare: [4, 12, 20, 28], ride: every(2), crash: [0] },
    'Song-style interpretation of a blues-rock groove.',
  ),
  preset(
    'Classic Metal Style',
    144,
    'songs',
    { kick: [0, 4, 8, 12, 16, 20, 24, 28], snare: [4, 12, 20, 28], closedHat: every(2), crash: [0, 16] },
    'Song-style interpretation of classic metal.',
  ),
  preset(
    'Thrash Metal Style',
    184,
    'songs',
    { kick: every(2), snare: [4, 12, 20, 28], ride: every(2), crash: [0, 16] },
    'Song-style interpretation of thrash metal.',
  ),
  preset(
    'Punk Rock Style',
    178,
    'songs',
    { kick: [0, 8, 16, 24], snare: [4, 12, 20, 28], closedHat: every(2), crash: every(4) },
    'Song-style interpretation of straight punk rock.',
  ),
  preset(
    'Prog Metal Style',
    128,
    'songs',
    { kick: [0, 3, 7, 8, 13, 16, 19, 23, 24, 29], snare: [4, 12, 20, 28], ride: every(2), highTom: [14, 30] },
    'Song-style interpretation of a syncopated prog-metal groove.',
  ),
  preset(
    'Doom Metal Style',
    68,
    'songs',
    { kick: [0, 8, 16, 24], snare: [8, 24], closedHat: every(4), crash: [0, 16] },
    'Song-style interpretation of a slow heavy groove.',
  ),
  preset(
    'Alternative Rock Style',
    110,
    'songs',
    {
      kick: [0, 6, 8, 16, 22, 24],
      snare: [4, 12, 20, 28],
      closedHat: every(2),
      openHat: [14, 30],
      crash: [0],
    },
    'Song-style interpretation of alternative rock.',
  ),
]

const INDUSTRIAL_PRESETS = [
  preset('Industrial March', 110, 'industrial', {
    kick: every(4),
    snare: [4, 12, 20, 28],
    closedHat: every(2),
  }),
  preset('Electronic Rock', 120, 'industrial', {
    kick: [0, 3, 8, 10, 16, 19, 24, 27],
    snare: [4, 12, 20, 28],
    closedHat: every(2).filter((s) => s !== 14 && s !== 30),
    openHat: [14, 30],
    crash: [0],
  }),
  preset('Mechanical Metal', 150, 'industrial', {
    kick: [...every(2), 11, 27, 31],
    snare: [4, 12, 20, 28],
    ride: every(2),
    crash: [0, 16],
  }),
  preset('Half-time Industrial', 90, 'industrial', {
    kick: [0, 6, 16, 23],
    snare: [8, 24],
    closedHat: every(1),
  }),
  preset('Industrial Gallop', 135, 'industrial', {
    kick: every(4).flatMap((s) => [s, s + 2, s + 3]),
    snare: [4, 12, 20, 28],
    closedHat: every(2).filter((s) => s < 26),
    highTom: [26, 28],
    lowTom: [29, 30, 31],
  }),
].map((p) => {
  p.kitId = 'industrial'
  return p
})
export const PRESETS: Preset[] = [...BASE_PRESETS, ...EXTRA_PRESETS, ...INDUSTRIAL_PRESETS]

export function initialState(patternName = PRESETS[0].pattern.name): AppState {
  return {
    version: 1,
    session: {
      pattern: { ...structuredClone(PRESETS[0].pattern), name: patternName },
      bpm: 100,
      master: 0.65,
      countIn: true,
      mixer: Object.fromEntries(TRACKS.map((t) => [t.id, { volume: t.gain, muted: false }])) as Mixer,
    },
    library: [],
  }
}

export function editStep(value: Step, accent: boolean): Step {
  return accent ? (value === 2 ? 1 : 2) : value === 0 ? 1 : 0
}
