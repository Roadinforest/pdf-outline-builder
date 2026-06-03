import { ArrowRight, FileText, ShieldCheck, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { PreviewLayout } from '@/components/PreviewLayout'

const highlights = [
  {
    description: 'PDF.js runs in the browser, so text extraction and heading detection happen before any upload.',
    icon: Upload,
    title: 'Local-first parsing',
  },
  {
    description: 'The editor keeps flat PDF outline data readable while exposing it as a nested tree you can fix quickly.',
    icon: FileText,
    title: 'Tree-based outline editing',
  },
  {
    description: 'The API only receives the final source blob URL and approved outline payload, reducing server cost.',
    icon: ShieldCheck,
    title: 'Minimal export backend',
  },
]

export function HomePage() {
  return (
    <PreviewLayout title="Independent Vercel-ready product">
      <div className="px-6 py-10">
        <div className="mx-auto grid max-w-[1400px] gap-6 xl:grid-cols-[1.1fr,0.9fr]">
          <section className="overflow-hidden rounded-[40px] border border-zinc-200/70 bg-white/85 p-8 shadow-sm backdrop-blur-sm lg:p-12">
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">React + Hono + Blob</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-zinc-950 lg:text-6xl">
              Build PDF bookmarks in the browser, export once on the server.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-zinc-600">
              This monorepo follows the deployment plan directly: a Vite front end, a Hono API, shared schemas,
              client uploads for Vercel Blob, and a synchronous export pipeline that still records jobs.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/builder">
                <Button>
                  Open Builder
                  <ArrowRight />
                </Button>
              </Link>
              <Link to="/docs">
                <Button variant="outline">Read Constraints</Button>
              </Link>
            </div>
          </section>

          <section className="rounded-[40px] border border-zinc-200/70 bg-zinc-950 p-8 text-zinc-100 shadow-sm lg:p-12">
            <p className="text-xs uppercase tracking-[0.3em] text-amber-300">MVP Boundaries</p>
            <div className="mt-6 space-y-4 text-sm leading-7 text-zinc-300">
              <p>Recommended for text PDFs up to 50MB and roughly 300 pages.</p>
              <p>Unsupported by design in this version: OCR, bulk processing, and long-running background queues.</p>
              <p>The API ships with an in-memory job store for local work and uses Vercel Blob when its token exists.</p>
            </div>
          </section>

          <section className="xl:col-span-2 grid gap-4 md:grid-cols-3">
            {highlights.map((item) => (
              <article
                key={item.title}
                className="rounded-[32px] border border-zinc-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-sm"
              >
                <div className="inline-flex rounded-2xl bg-amber-100 p-3 text-amber-700">
                  <item.icon />
                </div>
                <h2 className="mt-5 text-xl font-semibold text-zinc-950">{item.title}</h2>
                <p className="mt-3 text-sm leading-7 text-zinc-600">{item.description}</p>
              </article>
            ))}
          </section>
        </div>
      </div>
    </PreviewLayout>
  )
}
