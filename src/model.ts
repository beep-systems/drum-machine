export const TRACKS = [
  { id: 'kick', name: 'Бочка', short: 'BD', color: '#c2ef72', gain: 0.9, samples: ['kick-1', 'kick-2'] },
  { id: 'snare', name: 'Малый', short: 'SN', color: '#e8bb7d', gain: 0.8, samples: ['snare-1', 'snare-2'] },
  {
    id: 'closedHat',
    name: 'Закрытый хэт',
    short: 'CH',
    color: '#8bbfb0',
    gain: 0.52,
    samples: ['closed-hat'],
  },
  { id: 'openHat', name: 'Открытый хэт', short: 'OH', color: '#8bbfb0', gain: 0.48, samples: ['open-hat'] },
  { id: 'crash', name: 'Крэш', short: 'CR', color: '#b5a4d8', gain: 0.55, samples: ['crash'] },
  { id: 'ride', name: 'Райд', short: 'RD', color: '#b5a4d8', gain: 0.55, samples: ['ride'] },
  { id: 'highTom', name: 'Высокий том', short: 'HT', color: '#d49688', gain: 0.72, samples: ['high-tom'] },
  { id: 'lowTom', name: 'Низкий том', short: 'LT', color: '#d49688', gain: 0.8, samples: ['low-tom'] },
] as const

export type TrackId = (typeof TRACKS)[number]['id']
export type Step = 0 | 1 | 2
export type Pattern = { name: string; tracks: Record<TrackId, Step[]> }
export type Mixer = Record<TrackId, { volume: number; muted: boolean }>
export type Session = { pattern: Pattern; bpm: number; master: number; countIn: boolean; mixer: Mixer }
export type SavedPattern = { id: string; pattern: Pattern; bpm: number }
export type AppState = { version: 1; session: Session; library: SavedPattern[] }
export const STEPS = 32

export function emptyPattern(name: string): Pattern {
  return {
    name,
    tracks: Object.fromEntries(TRACKS.map((t) => [t.id, Array<Step>(STEPS).fill(0)])) as Pattern['tracks'],
  }
}

function preset(name: string, bpm: number, hits: Partial<Record<TrackId, number[]>>): SavedPattern {
  const pattern = emptyPattern(name)
  for (const track of TRACKS) {
    for (const step of hits[track.id] ?? []) pattern.tracks[track.id][step] = 1
  }
  for (const step of [0, 16]) if (pattern.tracks.kick[step]) pattern.tracks.kick[step] = 2
  return { id: name, bpm, pattern }
}
const every = (n: number) => Array.from({ length: STEPS / n }, (_, i) => i * n)

export const PRESETS = [
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

export function initialState(): AppState {
  return {
    version: 1,
    session: {
      pattern: structuredClone(PRESETS[0].pattern),
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
