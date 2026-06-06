import { Hono } from 'hono'
import { refineRequestSchema } from '@pdf-outline-builder/shared'
import { applyOutlineToPdf } from '../services/exportPdf.js'
import { jobStore } from '../services/jobStore.js'
import { readSourcePdf, uploadOutlinedPdf, isAllowedSourceUrl } from '../services/blobStorage.js'
import { validateExportRequest } from '../services/validators.js'
import { refineOutlineWithLLM } from '../services/refineOutline.js'
import { getMiniMaxConfig } from '../lib/env.js'

export const outlineRoute = new Hono()

outlineRoute.post('/export', async (c) => {
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

outlineRoute.post('/refine', async (c) => {
  let body: unknown

  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body.' }, 400)
  }

  const parsed = refineRequestSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid refine payload.' }, 400)
  }

  if (!getMiniMaxConfig()) {
    return c.json(
      {
        error: 'AI refinement is disabled. Set MINIMAX_API_KEY in the API environment to enable it.',
      },
      503,
    )
  }

  try {
    const result = await refineOutlineWithLLM({
      candidates: parsed.data.candidates,
      fileName: parsed.data.fileName,
      instruction: parsed.data.instruction,
    })

    return c.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI refinement failed.'
    return c.json({ error: message }, 502)
  }
})
