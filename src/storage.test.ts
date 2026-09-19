import { describe, expect, it, vi } from 'vitest'
import { initialState, PRESETS } from './model'
import { exportLibrary, importLibrary, restoreState, saveState, STORAGE_KEY } from './storage'

describe('browser storage', () => {
  it('round-trips a complete session', () => {
    const state = initialState()
    state.session.bpm = 217
    state.session.mixer.kick.muted = true
    state.library = structuredClone(PRESETS)
    const setItem = vi.fn()
    expect(saveState({ setItem }, state)).toBe(true)
    expect(setItem).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify(state))
    expect(restoreState({ getItem: () => JSON.stringify(state) })).toEqual({ state, warning: '' })
    expect(restoreState({ getItem: () => null }).state.session.bpm).toBe(100)
  })
  it('preserves corrupt source data and degrades gracefully on denied/quota storage', () => {
    const setItem = vi.fn(() => {
      throw new Error('QuotaExceededError')
    })
    expect(saveState({ setItem }, initialState())).toBe(false)
    expect(restoreState({ getItem: () => '{broken' }).warning).not.toBe('')
    expect(
      restoreState({
        getItem: () => {
          throw new Error('SecurityError')
        },
      }).warning,
    ).not.toBe('')
  })
})

describe('library interchange', () => {
  it('round-trips JSON, merges without overwriting, and skips duplicate contents', () => {
    const exported = exportLibrary(PRESETS)
    expect(importLibrary(exported, [])).toEqual(PRESETS)
    expect(importLibrary(exported, structuredClone(PRESETS))).toEqual(PRESETS)
    const changed = structuredClone(PRESETS[0])
    changed.bpm = 123
    const result = importLibrary(exportLibrary([changed]), [PRESETS[0]])
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual(PRESETS[0])
    expect(result[1].id).not.toBe(PRESETS[0].id)
    expect(result[1].bpm).toBe(123)
  })
  it.each([
    '{',
    '{"version":2,"kind":"drum-machine-library","patterns":[]}',
    JSON.stringify({ version: 1, kind: 'drum-machine-library', patterns: [{ ...PRESETS[0], bpm: 301 }] }),
    JSON.stringify({
      version: 1,
      kind: 'drum-machine-library',
      patterns: [{ ...PRESETS[0], pattern: { name: 'x', tracks: {} } }],
    }),
    JSON.stringify({ version: 1, kind: 'drum-machine-library', patterns: [PRESETS[0], PRESETS[0]] }),
  ])('rejects invalid input without modifying the existing library', (raw) => {
    const library = structuredClone(PRESETS)
    expect(() => importLibrary(raw, library)).toThrow()
    expect(library).toEqual(PRESETS)
  })
  it('rejects invalid steps, non-finite values, oversized files and capacity overflow', () => {
    const bad = structuredClone(PRESETS[0])
    bad.pattern.tracks.kick[0] = 7 as never
    expect(() => importLibrary(exportLibrary([bad]), [])).toThrow()
    bad.pattern = structuredClone(PRESETS[0].pattern)
    bad.bpm = Infinity
    expect(() => importLibrary(exportLibrary([bad]), [])).toThrow()
    expect(() => importLibrary(' '.repeat(1_000_001), [])).toThrow()
    const library = Array.from({ length: 128 }, (_, n) => ({ ...PRESETS[0], id: String(n) }))
    expect(() => importLibrary(exportLibrary([PRESETS[1]]), library)).toThrow()
  })
})
