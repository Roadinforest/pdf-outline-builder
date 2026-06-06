// Local unit test for the JSON extractor. Runs without an LLM.
// Usage: pnpm --filter @pdf-outline-builder/api exec tsx src/test-extract.ts

import 'dotenv/config'
import { extractJsonCandidate, parseJsonObject } from './services/_testableRefine.js'

interface Case {
  label: string
  response: unknown
  expectOutline: number
}

const outline = [
  { level: 1, pageNumber: 1, title: 'A' },
  { level: 2, pageNumber: 2, title: 'B' },
]
const outlineJson = JSON.stringify({ outline, reasoning: 'ok' })

const cases: Case[] = [
  {
    label: 'AIMessage-like with content as JSON string',
    response: {
      content: outlineJson,
      tool_calls: [],
      additional_kwargs: {},
      response_metadata: {},
    },
    expectOutline: 2,
  },
  {
    label: 'LC-serialised AIMessage (kwargs.content = JSON string)',
    response: {
      lc: 1,
      type: 'constructor',
      id: ['langchain_core', 'messages', 'AIMessage'],
      kwargs: {
        content: outlineJson,
        tool_calls: [],
        additional_kwargs: {},
      },
    },
    expectOutline: 2,
  },
  {
    label: 'tool_calls with parsed args',
    response: {
      content: '',
      tool_calls: [{ name: 'pdf_outline_refinement', args: { outline, reasoning: 'ok' } }],
      additional_kwargs: {},
    },
    expectOutline: 2,
  },
  {
    label: 'additional_kwargs.tool_calls with stringified arguments',
    response: {
      content: '',
      tool_calls: [],
      additional_kwargs: {
        tool_calls: [
          { function: { name: 'pdf_outline_refinement', arguments: outlineJson } },
        ],
      },
    },
    expectOutline: 2,
  },
  {
    label: 'content as fenced ```json```',
    response: {
      content: 'Here you go:\n```json\n' + JSON.stringify({ outline, reasoning: 'ok' }, null, 2) + '\n```\n',
      tool_calls: [],
      additional_kwargs: {},
    },
    expectOutline: 2,
  },
  {
    label: 'content as double-encoded JSON string',
    response: {
      content: JSON.stringify(outlineJson),
      tool_calls: [],
      additional_kwargs: {},
    },
    expectOutline: 2,
  },
  {
    label: 'content with prose wrapping a balanced JSON object',
    response: {
      content: 'Sure! ' + outlineJson + ' Hope that helps.',
      tool_calls: [],
      additional_kwargs: {},
    },
    expectOutline: 2,
  },
  {
    label: 'content with braces in prose before JSON object',
    response: {
      content: 'prefix {not json} middle ' + outlineJson + ' suffix',
      tool_calls: [],
      additional_kwargs: {},
    },
    expectOutline: 2,
  },
  {
    label: 'content as an array of {type:"text", text:"..."} parts',
    response: {
      content: [
        { type: 'text', text: 'Here is the outline: ' },
        { type: 'text', text: outlineJson },
      ],
      tool_calls: [],
      additional_kwargs: {},
    },
    expectOutline: 2,
  },
  {
    label: 'garbage content',
    response: { content: 'I am sorry, I cannot help with that.', tool_calls: [] },
    expectOutline: 0,
  },
  {
    label: 'null response',
    response: null,
    expectOutline: 0,
  },
  {
    label: 'no response',
    response: undefined,
    expectOutline: 0,
  },
]

let passed = 0
let failed = 0
for (const test of cases) {
  const got = extractJsonCandidate(test.response)
  const outline = (got as { outline?: unknown[] } | null)?.outline
  const length = Array.isArray(outline) ? outline.length : 0
  const ok = length === test.expectOutline
  if (ok) {
    passed += 1
    console.log(`  ✓ ${test.label}  → outline.length=${length}`)
  } else {
    failed += 1
    console.log(`  ✗ ${test.label}  → expected ${test.expectOutline}, got ${length}`)
    console.log('    got =', JSON.stringify(got)?.slice(0, 200))
  }
}

console.log(`\nparseJsonObject sanity:`)
console.log('  ✓ direct JSON  →', Boolean(parseJsonObject(outlineJson)))
console.log('  ✓ fenced JSON  →', Boolean(parseJsonObject('```json\n' + outlineJson + '\n```')))
console.log('  ✓ wrapped JSON →', Boolean(parseJsonObject('noise ' + outlineJson + ' tail')))
console.log('  ✗ non-JSON     →', parseJsonObject('hello world') === null ? 'null (correct)' : 'NOT null!')
console.log('  ✗ empty        →', parseJsonObject('') === null ? 'null (correct)' : 'NOT null!')

console.log(`\n=== ${passed} passed, ${failed} failed ===`)
if (failed > 0) process.exitCode = 1
