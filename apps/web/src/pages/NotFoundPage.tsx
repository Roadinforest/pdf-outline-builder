import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { PreviewLayout } from '@/components/PreviewLayout'
import { useTranslations } from '@/i18n'

export function NotFoundPage() {
  const dict = useTranslations()

  return (
    <PreviewLayout title={dict.notFound.layoutTitle}>
      <div className="px-6 py-16">
        <div className="mx-auto max-w-2xl rounded-[36px] border border-zinc-200/70 bg-white/85 p-10 text-center shadow-sm backdrop-blur-sm">
          <h1 className="text-3xl font-semibold text-zinc-950">{dict.notFound.title}</h1>
          <p className="mt-4 text-sm leading-7 text-zinc-600">{dict.notFound.description}</p>
          <div className="mt-8">
            <Link to="/">
              <Button>{dict.notFound.openBuilder}</Button>
            </Link>
          </div>
        </div>
      </div>
    </PreviewLayout>
  )
}
