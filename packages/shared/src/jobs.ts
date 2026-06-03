import { z } from 'zod'

export const jobStatusSchema = z.enum(['queued', 'processing', 'completed', 'failed'])

export const exportJobSchema = z.object({
  createdAt: z.string().datetime(),
  downloadUrl: z.string().url().nullable(),
  error: z.string().nullable(),
  fileName: z.string(),
  id: z.string(),
  sourceBlobUrl: z.string().url(),
  status: jobStatusSchema,
  updatedAt: z.string().datetime(),
})

export const createExportResponseSchema = z.object({
  downloadUrl: z.string().url().nullable().optional(),
  jobId: z.string(),
  status: jobStatusSchema,
})

export const healthResponseSchema = z.object({
  service: z.literal('pdf-outline-api'),
  status: z.literal('ok'),
  storage: z.enum(['blob', 'local', 'unavailable']),
})

export type CreateExportResponse = z.infer<typeof createExportResponseSchema>
export type ExportJob = z.infer<typeof exportJobSchema>
export type JobStatus = z.infer<typeof jobStatusSchema>
export type HealthResponse = z.infer<typeof healthResponseSchema>
