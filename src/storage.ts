import {
  initialState,
  STEPS,
  TRACKS,
  type AppState,
  type Pattern,
  type SavedPattern,
  type Session,
} from './model'

export const STORAGE_KEY = 'drum-machine:v1'
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const numberIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
const nameValid = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 60

export function isPattern(v: unknown): v is Pattern {
  if (!object(v) || !nameValid(v.name) || !object(v.tracks)) return false
  const tracks = v.tracks
  return TRACKS.every((t) => {
    const steps = tracks[t.id]
    return (
      Array.isArray(steps) &&
      steps.length === STEPS &&
      steps.every((x: unknown) => x === 0 || x === 1 || x === 2)
    )
  })
}
function isSaved(v: unknown): v is SavedPattern {
  return (
    object(v) &&
    typeof v.id === 'string' &&
    v.id.length > 0 &&
    v.id.length <= 100 &&
    isPattern(v.pattern) &&
    numberIn(v.bpm, 40, 300) &&
    Number.isInteger(v.bpm)
  )
}
function isLibrary(v: unknown): v is SavedPattern[] {
  return (
    Array.isArray(v) && v.length <= 128 && v.every(isSaved) && new Set(v.map((p) => p.id)).size === v.length
  )
}
function isSession(v: unknown): v is Session {
  if (
    !object(v) ||
    !isPattern(v.pattern) ||
    !numberIn(v.bpm, 40, 300) ||
    !Number.isInteger(v.bpm) ||
    !numberIn(v.master, 0, 1) ||
    typeof v.countIn !== 'boolean' ||
    !object(v.mixer)
  )
    return false
  const mixer = v.mixer
  return TRACKS.every((t) => {
    const m = mixer[t.id]
    return object(m) && numberIn(m.volume, 0, 1) && typeof m.muted === 'boolean'
  })
}

export function restoreState(storage: Pick<Storage, 'getItem'>): { state: AppState; warning: string } {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (raw === null) return { state: initialState(), warning: '' }
    const parsed: unknown = JSON.parse(raw)
    if (!object(parsed) || parsed.version !== 1 || !isSession(parsed.session) || !isLibrary(parsed.library))
      throw new Error('invalid')
    return { state: { version: 1, session: parsed.session, library: parsed.library }, warning: '' }
  } catch {
    return {
      state: initialState(),
      warning:
        'Не удалось восстановить настройки. Автосохранение отключено, исходные данные сохранены в браузере. Можно продолжать и экспортировать ритмы в файл.',
    }
  }
}

export function saveState(storage: Pick<Storage, 'setItem'>, state: AppState): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

export function exportLibrary(library: SavedPattern[]): string {
  return JSON.stringify({ version: 1, kind: 'drum-machine-library', patterns: library }, null, 2)
}
export function importLibrary(raw: string, existing: SavedPattern[]): SavedPattern[] {
  if (raw.length > 1_000_000) throw new Error('Файл слишком большой: максимум 1 МБ.')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Не удалось прочитать JSON. Библиотека не изменена.')
  }
  if (
    !object(parsed) ||
    parsed.version !== 1 ||
    parsed.kind !== 'drum-machine-library' ||
    !isLibrary(parsed.patterns)
  )
    throw new Error('Неверный формат библиотеки или неподдерживаемая версия. Библиотека не изменена.')
  // Import adds copies; it never silently overwrites a locally edited pattern.
  const additions = parsed.patterns.filter(
    (p) => !existing.some((e) => JSON.stringify(e.pattern) === JSON.stringify(p.pattern) && e.bpm === p.bpm),
  )
  if (existing.length + additions.length > 128)
    throw new Error('В библиотеке может быть не больше 128 ритмов.')
  const ids = new Set(existing.map((p) => p.id))
  const result = [...existing]
  for (const item of additions) {
    let id = item.id
    for (let suffix = 1; ids.has(id); suffix++) id = `${item.id.slice(0, 80)}-${suffix}`
    ids.add(id)
    result.push({ id, pattern: structuredClone(item.pattern), bpm: item.bpm })
  }
  return result
}
