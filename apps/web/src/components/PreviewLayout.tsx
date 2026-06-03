import type { PropsWithChildren, ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/cn'

interface PreviewLayoutProps extends PropsWithChildren {
  actions?: ReactNode
  title: string
}

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/builder', label: 'Builder' },
  { href: '/docs', label: 'Docs' },
]

export function PreviewLayout({ actions, children, title }: PreviewLayoutProps) {
  const location = useLocation()

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-zinc-200/70 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
            <div>
              <Link to="/" className="text-lg font-semibold tracking-tight text-zinc-950">
                PDF Outline Builder
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
          {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
