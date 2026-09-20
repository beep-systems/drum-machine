import { describe, expect, it, vi } from 'vitest'
import { dictionaries, LOCALE_KEY, messageText, presetText, readLocale } from './index'
import { AppError, problemOf } from '../messages'
import { initialState, PRESETS, TRACKS } from '../model'
import { exportLibrary, importLibrary, restoreState, saveState, STORAGE_KEY } from '../storage'

describe('localization without changing saved music', () => {
  it('uses English unless a supported language was explicitly saved', () => {
    for (const value of [null, '', 'DE', 'fr', '{}']) expect(readLocale({ getItem: () => value })).toBe('en')
    for (const locale of ['en', 'de', 'ru'] as const) {
      const getItem = vi.fn(() => locale)
      expect(readLocale({ getItem })).toBe(locale)
      expect(getItem).toHaveBeenCalledWith(LOCALE_KEY)
    }
    expect(
      readLocale({
        getItem: () => {
          throw new Error('denied')
        },
      }),
    ).toBe('en')
  })

  it('covers every built-in ID and track with complete matching dictionaries', () => {
    const ids = PRESETS.map((preset) => preset.id).sort()
    for (const text of Object.values(dictionaries)) {
      expect(Object.keys(text).sort()).toEqual(Object.keys(dictionaries.en).sort())
      expect(Object.keys(text.presets).sort()).toEqual(ids)
      expect(Object.keys(text.tracks).sort()).toEqual(TRACKS.map((track) => track.id).sort())
      for (const preset of PRESETS) {
        const info = presetText(text, preset.id)
        expect(info.name.trim()).not.toBe('')
        expect(info.name.length).toBeLessThanOrEqual(60)
        if (preset.description) expect(info.description.trim()).not.toBe('')
      }
    }
  })

  it('localizes domain errors and notices at display time without losing parameters', () => {
    const problem = problemOf(new AppError({ code: 'sampleLoad', sample: 'kick-1' }), { code: 'audioFailed' })
    expect(messageText(dictionaries.en, problem)).toContain('Could not load sample kick-1')
    expect(messageText(dictionaries.de, problem)).toContain('Sample kick-1 konnte nicht geladen werden')
    expect(messageText(dictionaries.ru, problem)).toContain('Не загружен сэмпл kick-1')
    for (const text of Object.values(dictionaries)) {
      expect(messageText(text, { code: 'saved', name: 'Мой Riff Ä' })).toContain('Мой Riff Ä')
    }
    expect(problemOf(new Error('raw browser message'), { code: 'audioFailed' })).toEqual({
      code: 'audioFailed',
    })
    expect(() => importLibrary('{', [])).toThrowError(new AppError({ code: 'invalidJson' }))
  })

  it('restores legacy v1 state verbatim and only localizes a fresh working copy', () => {
    const legacy = initialState()
    legacy.session.pattern.name = 'Мой Riff Ä'
    legacy.library = [{ id: 'Базовый рок', pattern: legacy.session.pattern, bpm: 137 }]
    const fresh = () => initialState(presetText(dictionaries.de, PRESETS[0].id).name)
    expect(restoreState({ getItem: () => JSON.stringify(legacy) }, fresh).state).toEqual(legacy)
    expect(restoreState({ getItem: () => null }, fresh).state.session.pattern.name).toBe('Rock-Grundrhythmus')
    expect(importLibrary(exportLibrary(legacy.library), [])).toEqual(legacy.library)
    const exported = JSON.parse(exportLibrary(legacy.library))
    expect(Object.keys(exported).sort()).toEqual(['kind', 'patterns', 'version'])
    expect(Object.keys(exported.patterns[0]).sort()).toEqual(['bpm', 'id', 'pattern'])
    const setItem = vi.fn()
    saveState({ setItem }, legacy)
    expect(setItem).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify(legacy))
  })
})
