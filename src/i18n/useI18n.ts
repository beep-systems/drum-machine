import { useEffect, useState } from 'react'
import { dictionaries, LOCALE_KEY, readLocale, type Locale } from './index'

export function useI18n() {
  const [locale, updateLocale] = useState<Locale>(() => {
    try {
      return readLocale(window.localStorage)
    } catch {
      return 'en'
    }
  })
  const text = dictionaries[locale]

  useEffect(() => {
    document.documentElement.lang = locale
    document.title = text.pageTitle
    document.querySelector('meta[name="description"]')?.setAttribute('content', text.pageDescription)
  }, [locale, text])

  function setLocale(next: Locale) {
    updateLocale(next)
    try {
      window.localStorage.setItem(LOCALE_KEY, next)
    } catch {
      // Language switching still works in memory when storage is denied or full.
    }
  }

  return { locale, setLocale, text }
}
