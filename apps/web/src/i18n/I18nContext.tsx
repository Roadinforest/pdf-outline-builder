import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import enDictionary from './dictionaries/en'
import zhDictionary from './dictionaries/zh'
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  type Dictionary,
  type InterpolationValues,
  type Locale,
} from './types'

const dictionaries: Record<Locale, Dictionary> = {
  en: enDictionary,
  zh: zhDictionary,
}

function isLocale(value: string | null): value is Locale {
  return value !== null && (SUPPORTED_LOCALES as string[]).includes(value)
}

function readInitialLocale(): Locale {
  if (typeof window === 'undefined') {
    return DEFAULT_LOCALE
  }

  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
  if (isLocale(stored)) {
    return stored
  }

  const browser = window.navigator.language.toLowerCase()
  if (browser.startsWith('zh')) {
    return 'zh'
  }

  return DEFAULT_LOCALE
}

function interpolate(template: string, values: InterpolationValues | undefined): string {
  if (!values) {
    return template
  }

  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key]
    return value === undefined ? match : String(value)
  })
}

interface I18nContextValue {
  locale: Locale
  setLocale: (next: Locale) => void
  toggleLocale: () => void
  t: (template: string, values?: InterpolationValues) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

interface I18nProviderProps {
  children: ReactNode
}

export function I18nProvider({ children }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(readInitialLocale)

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale
    }
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next)
    }
  }, [])

  const toggleLocale = useCallback(() => {
    setLocaleState((current) => {
      const next: Locale = current === 'en' ? 'zh' : 'en'
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, next)
      }
      return next
    })
  }, [])

  const t = useCallback(
    (template: string, values?: InterpolationValues) => interpolate(template, values),
    [],
  )

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, toggleLocale, t }),
    [locale, setLocale, toggleLocale, t],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider')
  }
  return context
}

export function useTranslations() {
  const { locale } = useI18n()
  return useMemo(() => dictionaries[locale], [locale])
}
