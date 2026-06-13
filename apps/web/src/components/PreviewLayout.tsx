import type { PropsWithChildren, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Languages } from 'lucide-react'
import { LOCALE_LABELS, useI18n, useTranslations } from '@/i18n'

interface PreviewLayoutProps extends PropsWithChildren {
  actions?: ReactNode
  title: string
}

function LanguageToggle() {
  const { locale, toggleLocale } = useI18n()
  const dict = useTranslations()
  const nextLocale = locale === 'en' ? 'zh' : 'en'

  return (
    <button
      type="button"
      onClick={toggleLocale}
      aria-label={dict.language.switchTo}
      title={dict.language.switchTo}
      className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-100"
    >
      <Languages className="size-4" />
      <span className="text-xs uppercase tracking-[0.2em] text-zinc-500">{dict.language.label}</span>
      <span className="font-medium text-zinc-900">{LOCALE_LABELS[nextLocale]}</span>
    </button>
  )
}

export function PreviewLayout({ actions, children, title }: PreviewLayoutProps) {
  const dict = useTranslations()

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-zinc-200/70 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2">
            <div>
              <Link to="/" className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight text-zinc-950">
                <img
                  src="/favicon-rounded.png"
                  alt=""
                  className="size-7 rounded-lg"
                  aria-hidden="true"
                />
                {dict.layout.brand}
              </Link>
              <p className="text-sm text-zinc-600">{title}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <LanguageToggle />
            {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
