import type { PropsWithChildren, ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Languages } from 'lucide-react'
import { LOCALE_LABELS, useI18n, useTranslations } from '@/i18n'
import { cn } from '@/lib/cn'

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
  const location = useLocation()
  const dict = useTranslations()
  const navItems = [
    { href: '/', label: dict.nav.home },
    { href: '/builder', label: dict.nav.builder },
    { href: '/docs', label: dict.nav.docs },
  ]

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-zinc-200/70 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
            <div>
              <Link to="/" className="text-lg font-semibold tracking-tight text-zinc-950">
                {dict.layout.brand}
              </Link>
              <p className="text-sm text-zinc-600">{title}</p>
            </div>
            <nav className="flex flex-wrap gap-2">
              {navItems.map((item) => {
                const isActive = location.pathname === item.href

                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={cn(
                      'rounded-full px-4 py-2 text-sm transition',
                      isActive ? 'bg-zinc-950 text-white' : 'bg-white text-zinc-700 hover:bg-zinc-100',
                    )}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </nav>
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
