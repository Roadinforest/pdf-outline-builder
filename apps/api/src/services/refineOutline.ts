import { randomUUID } from 'node:crypto'
import { ChatAnthropic } from '@langchain/anthropic'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { ChatOpenAI } from '@langchain/openai'
import { z } from 'zod'
import type { RefineCandidate, RefineResponse, RefinedNode } from '@pdf-outline-builder/shared'
import { getMiniMaxConfig, type MiniMaxConfig } from '../lib/env.js'

const structuredResponseSchema = z.object({
  outline: z.array(
    z.object({
      level: z.number().int().min(1).max(6),
      pageNumber: z.number().int().positive(),
      title: z.string().trim().min(1).max(200),
    }),
  ).min(1).max(2000),
  reasoning: z.string().trim().max(1000).optional(),
})

const LLM_MAX_OUTPUT_TOKENS = 4096

const systemPromptToolMode = `You are an assistant that cleans up candidate PDF outline entries.

The user will give you a JSON list of candidate outline nodes produced by a local PDF parser. Each candidate has a title (raw text from a PDF page), a page number, a numeric level, and a confidence score (0-1, higher means the parser was more sure).

Your job, in this exact order:
1. Filter out anything that is NOT a real section/chapter heading. Drop body sentences, footnotes, page numbers, references, copyright lines, watermarks, "Table of Contents" entries that are not titles, and any text that ends in sentence punctuation without an obvious heading pattern.
2. Clean up the remaining titles: trim whitespace, collapse internal double spaces, and remove stray punctuation that does not belong to a heading. Preserve numbering prefixes such as "1.", "1.2.3", "第N章", "Chapter N", roman numerals etc. Do NOT translate.
3. Keep the original \`pageNumber\` exactly. Do NOT invent pages.
4. Use the candidate's \`level\` as a hint, but you may bump it up or down by 1 if the surrounding candidates make it clear the level is wrong. Levels must stay between 1 and 6.
5. Return a single JSON object of the form {"outline": [{"title","pageNumber","level"}...], "reasoning": "..."}.
6. Output at most 200 nodes. If there are too many candidates, keep the highest-quality ones.
7. Never include explanations, apologies, or any prose outside of the JSON object.`

// Stage 2 prompt: explicitly forbid tool use and demand a plain JSON object.
const systemPromptJsonMode = `You are an assistant that cleans up candidate PDF outline entries.

The user will give you a JSON list of candidate outline nodes produced by a local PDF parser. Each candidate has a title (raw text from a PDF page), a page number, a numeric level, and a confidence score (0-1, higher means the parser was more sure).

Your job:
1. Filter out anything that is NOT a real section/chapter heading (body sentences, footnotes, page numbers, references, copyright lines, watermarks, "Table of Contents" entries that are not titles, captions of figures/tables, and any text that ends in sentence punctuation without an obvious heading pattern).
2. Clean up the remaining titles: trim whitespace, collapse internal double spaces, remove stray punctuation. Preserve numbering prefixes such as "1.", "1.2.3", "第N章", "Chapter N", roman numerals. Do NOT translate.
3. Keep the original \`pageNumber\` exactly.
4. The candidate's \`level\` is a hint; you may bump it up or down by 1 if the surrounding candidates make the level clearly wrong. Levels must stay between 1 and 6.
5. Return at most 200 nodes.

CRITICAL OUTPUT RULES:
- DO NOT call any function or tool. Respond with plain text only.
- Reply with ONE single JSON object and nothing else.
- The JSON object must have this exact shape: {"outline":[{"title":string,"pageNumber":number,"level":number}, ...], "reasoning":string}
- "reasoning" is a short one-sentence summary; use "" if you have nothing to add.
- No prose, no apologies, no markdown, no code fences, no commentary before or after the JSON.`

function buildUserPrompt(candidates: RefineCandidate[], instruction?: string) {
  const payload = JSON.stringify({ candidates }, null, 0)
  const extra = instruction?.trim() ? `\n\nAdditional instructions from the user:\n${instruction.trim()}` : ''
  return `Here are the PDF outline candidates (JSON):\n${payload}${extra}\n\nReturn the filtered, cleaned outline.`
}

function truncateCandidates(candidates: RefineCandidate[]): { kept: RefineCandidate[]; dropped: number } {
  const HARD_LIMIT = 400
  if (candidates.length <= HARD_LIMIT) {
    return { kept: candidates, dropped: 0 }
  }

  const sorted = [...candidates].sort((left, right) => (right.confidence ?? 0) - (left.confidence ?? 0))
  return { kept: sorted.slice(0, HARD_LIMIT), dropped: candidates.length - HARD_LIMIT }
}

function normalizeLevel(level: number): number {
  if (!Number.isFinite(level)) {
    return 1
  }
  return Math.max(1, Math.min(6, Math.round(level)))
}

function normalizeTitle(title: string): string {
  return title
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—:：·•●]+|[\s\-–—:：·•●]+$/g, '')
    .trim()
}

function dedupeByTitle(nodes: RefinedNode[]): RefinedNode[] {
  const seen = new Set<string>()
  const result: RefinedNode[] = []

  for (const node of nodes) {
    const key = node.title.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    result.push(node)
  }

  return result
}

function buildFallbackResponse(candidates: RefineCandidate[]): RefineResponse {
  const outline = candidates
    .map<RefinedNode>((candidate) => ({
      level: normalizeLevel(candidate.level),
      pageNumber: candidate.pageNumber,
      title: normalizeTitle(candidate.title),
    }))
    .filter((node) => node.title.length > 0)
    .filter((node) => node.title.length <= 200)

  return {
    model: 'fallback-no-llm',
    outline: dedupeByTitle(outline),
    reasoning: 'LLM unavailable; returned the original candidates in parser order.',
  }
}

interface RefineOptions {
  candidates: RefineCandidate[]
  fileName?: string
  instruction?: string
}

export async function refineOutlineWithLLM({ candidates, instruction }: RefineOptions): Promise<RefineResponse> {
  const config = getMiniMaxConfig()

  if (!config) {
    return buildFallbackResponse(candidates)
  }

  const { kept, dropped } = truncateCandidates(candidates)

  if (kept.length === 0) {
    return {
      model: config.model,
      outline: [],
      reasoning: 'No candidates were supplied to the language model.',
    }
  }

  const requestId = randomUUID()
  logRequest(requestId, config, kept, instruction)

  let parsed: z.infer<typeof structuredResponseSchema> | null

  try {
    parsed = await callStructured(requestId, config, kept, instruction)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'LLM request failed.'
    console.error(`[refineOutline:${requestId}] refineOutlineWithLLM failed`, error)
    throw new Error(`AI refinement failed: ${message}`)
  }

  if (!parsed || !Array.isArray(parsed.outline) || parsed.outline.length === 0) {
    console.warn(`[refineOutline:${requestId}] LLM returned no usable outline`, { parsed })
    throw new Error(
      'AI refinement failed: the language model returned an empty or unparseable outline. Try again, or use the manual outline editor.',
    )
  }

  const outline = dedupeByTitle(
    parsed.outline
      .map<RefinedNode>((node) => ({
        level: normalizeLevel(typeof node?.level === 'number' ? node.level : Number(node?.level) || 1),
        pageNumber:
          typeof node?.pageNumber === 'number' && Number.isFinite(node.pageNumber) && node.pageNumber > 0
            ? Math.floor(node.pageNumber)
            : 1,
        title: normalizeTitle(typeof node?.title === 'string' ? node.title : ''),
      }))
      .filter((node) => node.title.length > 0),
  )

  if (outline.length === 0) {
    throw new Error(
      'AI refinement failed: every returned entry was empty after normalization. Try again with more candidates.',
    )
  }

  const reasoningTail = dropped > 0
    ? ` Truncated ${dropped} low-confidence candidates before sending.`
    : ''

  return {
    model: config.model,
    outline,
    reasoning: (parsed.reasoning ?? '') + reasoningTail,
  }
}

function logRequest(requestId: string, config: MiniMaxConfig, candidates: RefineCandidate[], instruction?: string) {
  const baseUrl = config.baseUrl
  const protocol = isAnthropicBaseUrl(baseUrl) ? 'anthropic' : 'openai'
  console.log(
    [
      `\n[refineOutline:${requestId}] ── LLM REQUEST ─────────────────────────────`,
      `  model    : ${config.model}`,
      `  protocol : ${protocol}`,
      `  endpoint : ${baseUrl}`,
      `  count    : ${candidates.length} candidate(s)`,
      `  instruction: ${instruction?.trim() ? JSON.stringify(instruction.trim()) : '(none)'}`,
    ].join('\n'),
  )

  // Print each candidate on its own line, truncated for readability.
  for (const candidate of candidates) {
    const titlePreview = candidate.title.length > 100
      ? `${candidate.title.slice(0, 100)}…`
      : candidate.title
    console.log(
      `    · id=${candidate.id}  L${candidate.level}  p${candidate.pageNumber}  conf=${(candidate.confidence ?? 0).toFixed(2)}  "${titlePreview}"`,
    )
  }
  console.log(`[refineOutline:${requestId}] ─────────────────────────────────────────\n`)
}

function logResponse(requestId: string, stage: 'tool' | 'json', payload: unknown) {
  const header = stage === 'tool' ? 'TOOL-USE RESPONSE' : 'JSON-TEXT RESPONSE'
  console.log(`[refineOutline:${requestId}] ── LLM ${header} ──`)

  if (payload === null || payload === undefined) {
    console.log('  (empty)')
  } else if (typeof payload === 'string') {
    // Print up to ~2KB to keep logs readable; allow full inspection via env if needed.
    const limit = 2000
    const trimmed = payload.length > limit
      ? `${payload.slice(0, limit)}\n…(truncated, total ${payload.length} chars)`
      : payload
    console.log(trimmed)
  } else {
    try {
      console.log(JSON.stringify(payload, null, 2).slice(0, 4000))
    } catch {
      console.log(payload)
    }
  }
  console.log(`[refineOutline:${requestId}] ─────────────────────────────────────────\n`)
}

async function callStructured(
  requestId: string,
  config: MiniMaxConfig,
  candidates: RefineCandidate[],
  instruction?: string,
) {
  const model = buildChatModel(config)
  const userPrompt = buildUserPrompt(candidates, instruction)

  // Stage 1: try the structured-output (tool_use) path.
  try {
    const structured = model.withStructuredOutput(structuredResponseSchema, {
      name: 'pdf_outline_refinement',
    })
    const stage1Messages = [new SystemMessage(systemPromptToolMode), new HumanMessage(userPrompt)]
    console.log(`[refineOutline:${requestId}] stage=tool mode=withStructuredOutput`)
    const result = await structured.invoke(stage1Messages)
    logResponse(requestId, 'tool', result)
    return result
  } catch (structuredError) {
    const structuredMessage = structuredError instanceof Error ? structuredError.message : String(structuredError)
    console.warn(
      `[refineOutline:${requestId}] structured-output path failed, falling back to plain JSON text:`,
      structuredMessage,
    )
  }

  // Stage 2: plain chat, then dig for JSON in the response.
  const stage2Messages = [new SystemMessage(systemPromptJsonMode), new HumanMessage(userPrompt)]
  console.log(`[refineOutline:${requestId}] stage=json mode=plain-invoke`)
  const response = await model.invoke(stage2Messages)
  logResponse(requestId, 'json', response)
  logResponseDebug(requestId, response)

  const candidateJson = extractJsonCandidate(response)
  if (!candidateJson) {
    throw new Error(
      'AI refinement failed: the model did not return a JSON object. Try again, or use the manual outline editor.',
    )
  }

  return structuredResponseSchema.parse(candidateJson)
}

function logResponseDebug(requestId: string, response: unknown) {
  if (!response || typeof response !== 'object') {
    console.log(`[refineOutline:${requestId}] debug: response is not an object (typeof=${typeof response})`)
    return
  }
  const record = response as Record<string, unknown>
  const ownKeys = Object.keys(record)
  const ctor = (record as { constructor?: { name?: string } }).constructor?.name
  console.log(
    `[refineOutline:${requestId}] debug: response ctor=${ctor ?? '?'} ownKeys=${JSON.stringify(ownKeys)}`,
  )
  for (const key of ownKeys.slice(0, 20)) {
    const value = record[key]
    let preview: string
    if (value === null) {
      preview = 'null'
    } else if (value === undefined) {
      preview = 'undefined'
    } else if (typeof value === 'string') {
      preview = `string(len=${value.length}) ${JSON.stringify(value.slice(0, 200))}`
    } else if (Array.isArray(value)) {
      preview = `array(len=${value.length})`
    } else if (typeof value === 'object') {
      preview = `object keys=${JSON.stringify(Object.keys(value as object).slice(0, 10))}`
    } else {
      preview = `${typeof value}=${String(value)}`
    }
    console.log(`[refineOutline:${requestId}] debug:   .${key} = ${preview}`)
  }
}

function buildChatModel(config: MiniMaxConfig) {
  if (isAnthropicBaseUrl(config.baseUrl)) {
    return new ChatAnthropic({
      apiKey: config.apiKey,
      model: config.model,
      maxTokens: LLM_MAX_OUTPUT_TOKENS,
      temperature: 0.2,
      topP: 0.9,
      maxRetries: 1,
      clientOptions: {
        baseURL: config.baseUrl,
      },
    })
  }

  return new ChatOpenAI({
    apiKey: config.apiKey,
    model: config.model,
    maxTokens: LLM_MAX_OUTPUT_TOKENS,
    temperature: 0.2,
    topP: 0.9,
    maxRetries: 1,
    configuration: {
      baseURL: config.baseUrl,
    },
  })
}

/**
 * Pulls JSON out of an LLM response, in order of likelihood:
 * 1. `response.tool_calls[*].args` / `function.arguments`            (Anthropic + OpenAI tool_use)
 * 2. `response.additional_kwargs.tool_calls[*].function.arguments`  (raw upstream payload)
 * 3. `response.additional_kwargs.function_call.arguments`           (legacy OpenAI)
 * 4. `response.content` (or any nested string)                      (plain text)
 *    - try `JSON.parse(text)` directly
 *    - then ```json fenced blocks
 *    - then first balanced `{...}` block
 * 5. Last resort: walk the entire object tree for any string that parses
 *    to an object containing an `outline` array.
 */
function extractJsonCandidate(response: unknown): unknown | null {
  if (!response || typeof response !== 'object') {
    return null
  }

  const record = response as Record<string, unknown>

  // 1. LangChain normalised tool_calls (most common path on success).
  const toolCalls = record.tool_calls
  if (Array.isArray(toolCalls)) {
    for (const call of toolCalls) {
      if (!call || typeof call !== 'object') continue
      const args = (call as { args?: unknown }).args
      if (args && typeof args === 'object') {
        return args
      }
      const fnArgs = (call as { function?: { arguments?: unknown } }).function?.arguments
      if (typeof fnArgs === 'string') {
        const parsed = parseJsonObject(fnArgs)
        if (parsed) return parsed
      }
    }
  }

  // 2. Raw upstream tool_calls (Anthropic / OpenAI wire format).
  const additional = record.additional_kwargs
  if (additional && typeof additional === 'object') {
    const raw = (additional as { tool_calls?: unknown }).tool_calls
    if (Array.isArray(raw)) {
      for (const call of raw) {
        if (!call || typeof call !== 'object') continue
        const fn = (call as { function?: { arguments?: unknown } }).function
        if (fn && typeof fn === 'object') {
          const args = fn.arguments
          if (typeof args === 'string') {
            const parsed = parseJsonObject(args)
            if (parsed) return parsed
          } else if (args && typeof args === 'object') {
            return args
          }
        }
        const input = (call as { input?: unknown }).input
        if (input && typeof input === 'object') {
          return input
        }
      }
    }

    // 3. Legacy OpenAI function_call.
    const fnCall = (additional as { function_call?: { arguments?: unknown } }).function_call
    if (fnCall && typeof fnCall === 'object') {
      const args = fnCall.arguments
      if (typeof args === 'string') {
        const parsed = parseJsonObject(args)
        if (parsed) return parsed
      } else if (args && typeof args === 'object') {
        return args
      }
    }
  }

  // 4. Plain text content (multiple shapes).
  const direct = tryReadContent(record.content)
  if (direct !== null) {
    return direct
  }
  // 4b. Some LangChain versions wrap the AIMessage in an outer object.
  if (record.message) {
    const inner = tryReadContent((record as { message?: unknown }).message)
    if (inner !== null) {
      return inner
    }
  }
  // 4c. Some proxies serialise the AIMessage via toJSON(); the actual
  //     string content lives at kwargs.content.
  const kwargs = record.kwargs
  if (kwargs && typeof kwargs === 'object') {
    const inner = tryReadContent((kwargs as Record<string, unknown>).content)
    if (inner !== null) {
      return inner
    }
  }

  // 5. Last resort: walk the whole object for any string that parses to
  //    the expected shape.
  return findOutlineJsonDeep(record, 6)
}

function tryReadContent(content: unknown): unknown | null {
  if (content === undefined || content === null) {
    return null
  }

  // Direct object (already parsed).
  if (typeof content === 'object' && !Array.isArray(content)) {
    return content
  }

  // String content: try to parse it.
  if (typeof content === 'string') {
    const parsed = parseJsonObject(content)
    if (parsed) return parsed
    // String that looks like an LC-serialised AIMessage.
    if (content.trimStart().startsWith('{') && content.includes('"content"')) {
      try {
        const wrapped = JSON.parse(content)
        if (wrapped && typeof wrapped === 'object') {
          const inner = (wrapped as Record<string, unknown>).content
          if (typeof inner === 'string') {
            const parsed2 = parseJsonObject(inner)
            if (parsed2) return parsed2
          }
        }
      } catch {
        // ignore
      }
    }
    return null
  }

  // Array of content parts: concatenate text fields then parse.
  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object') {
          const t = (part as { text?: unknown }).text
          if (typeof t === 'string') return t
        }
        return ''
      })
      .join('')
    return parseJsonObject(text)
  }

  return null
}

function findOutlineJsonDeep(value: unknown, depth: number): unknown | null {
  if (depth <= 0) return null
  if (value === null || value === undefined) return null

  if (typeof value === 'string') {
    const parsed = parseJsonObject(value)
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { outline?: unknown }).outline)) {
      return parsed
    }
    return null
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findOutlineJsonDeep(item, depth - 1)
      if (found) return found
    }
    return null
  }

  if (typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      const found = findOutlineJsonDeep(v, depth - 1)
      if (found) return found
    }
  }

  return null
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part
        }
        if (part && typeof part === 'object' && 'text' in part && typeof (part as { text: unknown }).text === 'string') {
          return (part as { text: string }).text
        }
        return ''
      })
      .join('\n')
  }

  return ''
}

function parseJsonObject(text: string): unknown | null {
  const trimmed = text.trim()
  if (!trimmed) {
    return null
  }

  // 1. Direct parse.
  try {
    return parsePossiblyNestedJson(trimmed)
  } catch {
    // continue
  }

  // 2. ```json ... ``` fenced block.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/i)
  if (fenced) {
    try {
      return parsePossiblyNestedJson(fenced[1])
    } catch {
      // continue
    }
  }

  // 3. First balanced { ... } block.
  for (const candidate of findBalancedJsonObjects(trimmed)) {
    try {
      return parsePossiblyNestedJson(candidate)
    } catch {
      // continue
    }
  }

  return null
}

function parsePossiblyNestedJson(text: string): unknown {
  let parsed = JSON.parse(text) as unknown

  // Some providers return a JSON object encoded as a JSON string.
  while (typeof parsed === 'string') {
    parsed = JSON.parse(parsed) as unknown
  }

  return parsed
}

function findBalancedJsonObjects(text: string): string[] {
  const matches: string[] = []
  let start = -1
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]

    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{') {
      if (depth === 0) {
        start = index
      }
      depth += 1
      continue
    }

    if (char === '}' && depth > 0) {
      depth -= 1
      if (depth === 0 && start !== -1) {
        matches.push(text.slice(start, index + 1))
        start = -1
      }
    }
  }

  return matches
}

function isAnthropicBaseUrl(baseUrl: string) {
  const normalized = baseUrl.toLowerCase()
  return normalized.includes('anthropic') || normalized.endsWith('/v1/messages')
}
