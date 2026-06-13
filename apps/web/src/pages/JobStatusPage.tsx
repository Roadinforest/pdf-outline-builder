import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { ExportJob } from '@pdf-outline-builder/shared'
import { Button } from '@/components/ui/button'
import { PreviewLayout } from '@/components/PreviewLayout'
import { useTranslations } from '@/i18n'
import { apiUrl, readJsonOrThrow } from '@/lib/api'

export function JobStatusPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const [job, setJob] = useState<ExportJob | null>(null)
  const [error, setError] = useState('')
  const dict = useTranslations()

  useEffect(() => {
    if (!jobId) {
      setError(dict.jobStatus.missingJobId)
      return
    }

    let cancelled = false
    let timeoutId: number | undefined

    async function loadJob() {
      try {
        const response = await fetch(apiUrl(`/api/jobs/${jobId}`))
        const nextJob = await readJsonOrThrow<ExportJob>(response)

        if (cancelled) {
          return
        }

        setJob(nextJob)
        setError('')

        if (nextJob.status === 'queued' || nextJob.status === 'processing') {
          timeoutId = window.setTimeout(() => void loadJob(), 1500)
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : dict.jobStatus.loadFailed)
        }
      }
    }

    void loadJob()

    return () => {
      cancelled = true

      if (timeoutId) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [dict.jobStatus.loadFailed, dict.jobStatus.missingJobId, jobId])

  return (
    <PreviewLayout title={dict.jobStatus.layoutTitle}>
      <div className="px-6 py-10">
        <div className="mx-auto max-w-3xl rounded-[36px] border border-zinc-200/70 bg-white/85 p-8 shadow-sm backdrop-blur-sm">
          <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">{dict.jobStatus.eyebrow}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">{dict.jobStatus.title}</h1>

          {error ? (
            <p className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </p>
          ) : null}

          {job ? (
            <div className="mt-8 space-y-4 text-sm text-zinc-700">
              <p>
                <span className="font-medium text-zinc-950">{dict.jobStatus.job}:</span> {job.id}
              </p>
              <p>
                <span className="font-medium text-zinc-950">{dict.jobStatus.status}:</span> {job.status}
              </p>
              <p>
                <span className="font-medium text-zinc-950">{dict.jobStatus.file}:</span> {job.fileName}
              </p>
              <p>
                <span className="font-medium text-zinc-950">{dict.jobStatus.created}:</span>{' '}
                {new Date(job.createdAt).toLocaleString()}
              </p>
              <p>
                <span className="font-medium text-zinc-950">{dict.jobStatus.updated}:</span>{' '}
                {new Date(job.updatedAt).toLocaleString()}
              </p>
              {job.error ? (
                <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">{job.error}</p>
              ) : null}
              {job.downloadUrl ? (
                <a href={job.downloadUrl} target="_blank" rel="noreferrer">
                  <Button>{dict.jobStatus.download}</Button>
                </a>
              ) : null}
            </div>
          ) : (
            <p className="mt-6 text-sm text-zinc-600">{dict.jobStatus.loading}</p>
          )}

          <div className="mt-8">
            <Link to="/">
              <Button variant="outline">{dict.jobStatus.backToBuilder}</Button>
            </Link>
          </div>
        </div>
      </div>
    </PreviewLayout>
  )
}
