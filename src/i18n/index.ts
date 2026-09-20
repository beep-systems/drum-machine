import type { Notice } from '../messages'
import { en, type Dictionary } from './en'
import { de } from './de'
import { ru } from './ru'

export type Locale = 'en' | 'de' | 'ru'
export const LOCALE_KEY = 'drum-machine:locale'
export const dictionaries: Record<Locale, Dictionary> = { en, de, ru }
export const languages: Record<Locale, string> = { en: 'English', de: 'Deutsch', ru: 'Русский' }

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'de' || value === 'ru'
}

export function readLocale(storage: Pick<Storage, 'getItem'>): Locale {
  try {
    const value = storage.getItem(LOCALE_KEY)
    return isLocale(value) ? value : 'en'
  } catch {
    return 'en'
  }
}

export function presetText(text: Dictionary, id: string): { name: string; description: string } {
  // IDs are the historical, locale-independent keys; user-entered names never go through this lookup.
  return Object.hasOwn(text.presets, id)
    ? text.presets[id as keyof Dictionary['presets']]
    : { name: id, description: '' }
}

export function messageText(text: Dictionary, message: Notice): string {
  switch (message.code) {
    case 'saved':
    case 'deleted':
      return text[message.code](message.name)
    case 'sampleLoad':
    case 'sampleDecode':
      return text[message.code](message.sample)
    default:
      return text[message.code]
  }
}
