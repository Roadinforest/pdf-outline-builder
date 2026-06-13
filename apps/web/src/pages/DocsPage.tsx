import { PreviewLayout } from '@/components/PreviewLayout'
import { useTranslations } from '@/i18n'

export function DocsPage() {
  const dict = useTranslations()

  return (
    <PreviewLayout title={dict.docs.layoutTitle}>
      <div className="px-6 py-10">
        <div className="mx-auto max-w-4xl rounded-[36px] border border-zinc-200/70 bg-white/85 p-8 shadow-sm backdrop-blur-sm">
          <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">{dict.docs.eyebrow}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">{dict.docs.title}</h1>
          <div className="mt-8 space-y-4 text-sm leading-7 text-zinc-600">
            {dict.docs.sections.map((section) => (
              <p key={section}>{section}</p>
            ))}
          </div>
        </div>
      </div>
    </PreviewLayout>
  )
}
