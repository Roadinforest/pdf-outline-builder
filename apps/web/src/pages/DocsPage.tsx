import { PreviewLayout } from '@/components/PreviewLayout'

const sections = [
  'Files should stay at or below 50MB and 300 pages for the current Vercel-first export path.',
  'The browser extracts text locally. Only the uploaded PDF blob URL and approved outline JSON go to the API.',
  'Anonymous abuse protection is not wired yet. The upload and export routes are structured so rate limiting can be added cleanly.',
  'Local development falls back to filesystem-backed uploads when Vercel Blob tokens are not configured.',
]

export function DocsPage() {
  return (
    <PreviewLayout title="Limits, privacy, and operational notes">
      <div className="px-6 py-10">
        <div className="mx-auto max-w-4xl rounded-[36px] border border-zinc-200/70 bg-white/85 p-8 shadow-sm backdrop-blur-sm">
          <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">Operational Guide</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">What this version is optimized for</h1>
          <div className="mt-8 space-y-4 text-sm leading-7 text-zinc-600">
            {sections.map((section) => (
              <p key={section}>{section}</p>
            ))}
          </div>
        </div>
      </div>
    </PreviewLayout>
  )
}
