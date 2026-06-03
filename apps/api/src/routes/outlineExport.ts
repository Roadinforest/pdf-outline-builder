import { Hono } from 'hono'
import { applyOutlineToPdf } from '../services/exportPdf.js'
import { jobStore } from '../services/jobStore.js'
import { readSourcePdf, uploadOutlinedPdf, isAllowedSourceUrl } from '../services/blobStorage.js'
import { validateExportRequest } from '../services/validators.js'

export const outlineExportRoute = new Hono()

outlineExportRoute.post('/export', async (c) => {
  const payload = validateExportRequest(await c.req.json())

  if (!isAllowedSourceUrl(c.req.raw, payload.sourceBlobUrl)) {
    return c.json({ error: 'sourceBlobUrl must point to this service or Vercel Blob.' }, 400)
  }

  const job = jobStore.create({
    fileName: payload.document.fileName,
    outline: payload.outline,
    sourceBlobUrl: payload.sourceBlobUrl,
  })

  jobStore.markStatus(job.id, 'processing')

  try {
    const sourceBytes = await readSourcePdf(c.req.raw, payload.sourceBlobUrl)
    const outlinedBytes = await applyOutlineToPdf(sourceBytes, payload.outline)
    const output = await uploadOutlinedPdf(c.req.raw, payload.document.fileName, outlinedBytes)
    const completedJob = jobStore.markStatus(job.id, 'completed', {
      downloadUrl: output.url,
      error: null,
    })

    return c.json({
      downloadUrl: completedJob?.downloadUrl ?? null,
      jobId: job.id,
      status: completedJob?.status ?? 'completed',
    })
  } catch (error) {
    jobStore.markStatus(job.id, 'failed', {
      error: error instanceof Error ? error.message : 'Export failed.',
    })

    return c.json(
      {
        error: error instanceof Error ? error.message : 'Export failed.',
        jobId: job.id,
        status: 'failed',
      },
      500,
    )
  }
})
