// Bridge for unit tests. The main service file (`./refineOutline.ts`) does not
// export the internal helpers; this module re-implements them with the same
// logic so tests can exercise the JSON extraction without a network call.

export function parseJsonObject(text: string): unknown | null {
  const trimmed = text.trim()
  if (!trimmed) {
    return null
  }

  try {
    return parsePossiblyNestedJson(trimmed)
  } catch {
    // continue
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/i)
  if (fenced) {
    try {
      return parsePossiblyNestedJson(fenced[1])
    } catch {
      // continue
    }
  }

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

export function extractJsonCandidate(response: unknown): unknown | null {
  if (!response || typeof response !== 'object') {
    return null
  }

  const record = response as Record<string, unknown>

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

  const direct = tryReadContent(record.content)
  if (direct !== null) {
    return direct
  }
  if (record.message) {
    const inner = tryReadContent((record as { message?: unknown }).message)
    if (inner !== null) {
      return inner
    }
  }
  const kwargs = record.kwargs
  if (kwargs && typeof kwargs === 'object') {
    const inner = tryReadContent((kwargs as Record<string, unknown>).content)
    if (inner !== null) {
      return inner
    }
  }

  return findOutlineJsonDeep(record, 6)
}

function tryReadContent(content: unknown): unknown | null {
  if (content === undefined || content === null) {
    return null
  }

  if (typeof content === 'object' && !Array.isArray(content)) {
    return content
  }

  if (typeof content === 'string') {
    const parsed = parseJsonObject(content)
    if (parsed) return parsed
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
