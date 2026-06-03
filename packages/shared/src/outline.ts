import { z } from 'zod'

export const MAX_PDF_SIZE_BYTES = 50 * 1024 * 1024
export const MAX_PDF_PAGE_COUNT = 300
export const MAX_OUTLINE_NODES = 2000

export const outlineSourceSchema = z.enum(['embedded', 'detected', 'manual'])

export const exportDocumentSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  fileSize: z.number().int().positive().max(MAX_PDF_SIZE_BYTES).optional(),
  fingerprint: z.string().trim().min(1).max(200),
  pageCount: z.number().int().min(1).max(MAX_PDF_PAGE_COUNT),
})

export const exportOutlineNodeSchema = z.object({
  id: z.string().trim().min(1).max(160),
  level: z.number().int().min(1).max(6),
  order: z.number().int().positive(),
  pageNumber: z.number().int().positive(),
  source: outlineSourceSchema.optional(),
  title: z.string().trim().min(1).max(200),
})

export const exportRequestSchema = z.object({
  document: exportDocumentSchema,
  outline: z.array(exportOutlineNodeSchema).min(1).max(MAX_OUTLINE_NODES),
  sourceBlobUrl: z.string().url(),
})

export const uploadIntentSchema = z.object({
  contentType: z.literal('application/pdf'),
  fileName: z.string().trim().min(1).max(200),
  size: z.number().int().positive().max(MAX_PDF_SIZE_BYTES),
})

export type ExportDocument = z.infer<typeof exportDocumentSchema>
export type ExportOutlineNode = z.infer<typeof exportOutlineNodeSchema>
export type ExportRequest = z.infer<typeof exportRequestSchema>
export type OutlineSource = z.infer<typeof outlineSourceSchema>
export type UploadIntent = z.infer<typeof uploadIntentSchema>
