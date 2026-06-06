import { z } from 'zod'
import { MAX_OUTLINE_NODES } from './outline.js'

export const refineCandidateSchema = z.object({
  confidence: z.number().min(0).max(1).optional(),
  id: z.string().trim().min(1).max(160),
  level: z.number().int().min(1).max(6),
  pageNumber: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
})

export const refineRequestSchema = z.object({
  candidates: z.array(refineCandidateSchema).min(1).max(MAX_OUTLINE_NODES),
  fileName: z.string().trim().min(1).max(200).optional(),
  instruction: z.string().trim().min(1).max(500).optional(),
})

export const refinedNodeSchema = z.object({
  level: z.number().int().min(1).max(6),
  pageNumber: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
})

export const refineResponseSchema = z.object({
  model: z.string(),
  outline: z.array(refinedNodeSchema).max(MAX_OUTLINE_NODES),
  reasoning: z.string().trim().max(1000).optional(),
})

export type RefineCandidate = z.infer<typeof refineCandidateSchema>
export type RefineRequest = z.infer<typeof refineRequestSchema>
export type RefinedNode = z.infer<typeof refinedNodeSchema>
export type RefineResponse = z.infer<typeof refineResponseSchema>
