import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'

const workerUrl = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

GlobalWorkerOptions.workerSrc = `${workerUrl}?v=${__APP_BUILD_ID__}`

export type OutlineSource = 'embedded' | 'detected' | 'manual'

export interface PdfOutlineNode {
  confidence: number
  id: string
  level: number
  pageNumber: number
  source: OutlineSource
  title: string
}

export interface ParsedPdfDocument {
  analyzedLineCount: number
  embeddedOutline: PdfOutlineNode[]
  extractedTitleCount: number
  fileName: string
  fileSize: number
  fingerprint: string
  pageCount: number
  suggestedOutline: PdfOutlineNode[]
  warnings: string[]
}

interface PdfOutlineEntry {
  dest?: string | unknown[] | null
  items?: PdfOutlineEntry[]
  title: string
}

interface PdfReference {
  gen: number
  num: number
}

interface TextSegment {
  fontName: string
  height: number
  size: number
  text: string
  width: number
  x: number
  y: number
}

interface TextLine {
  fontName: string
  pageNumber: number
  size: number
  text: string
  x: number
  y: number
}

const numberingPatterns: Array<{ level: number; regex: RegExp }> = [
  { level: 1, regex: /^第[\d一二三四五六七八九十百千零]+[章节篇部分]/ },
  { level: 1, regex: /^\d+\s+[A-Z][A-Za-z0-9\s-]{1,}/ },
  { level: 1, regex: /^\d+\.(?!\d)/ },
  { level: 2, regex: /^\d+\.\d+(?!\.)/ },
  { level: 3, regex: /^\d+\.\d+\.\d+/ },
  { level: 2, regex: /^[一二三四五六七八九十]+[、.]/ },
  { level: 3, regex: /^[（(][一二三四五六七八九十]+[)）]/ },
]

function isPdfReference(value: unknown): value is PdfReference {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  return 'num' in value && 'gen' in value
}

function hasVisibleText(item: TextItem) {
  return typeof item.str === 'string' && item.str.trim().length > 0
}

function isTextItem(item: TextItem | { type: string }): item is TextItem {
  return 'str' in item
}

function getNumberingLevel(text: string) {
  const normalized = text.trim()

  for (const pattern of numberingPatterns) {
    if (pattern.regex.test(normalized)) {
      return pattern.level
    }
  }

  return null
}

function isLikelyBodyCopy(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim()

  if (normalized.length > 90) {
    return true
  }

  const commaCount = (normalized.match(/[，,、]/g) || []).length
  return commaCount >= 3 && normalized.length > 40
}

function shouldInsertSpace(previousText: string, nextText: string, gap: number) {
  if (gap <= 2) {
    return false
  }

  const previousChar = previousText.trim().slice(-1)
  const nextChar = nextText.trim().slice(0, 1)

  if (!previousChar || !nextChar) {
    return false
  }

  const joinsLatinWords = /[A-Za-z0-9]/.test(previousChar) && /[A-Za-z0-9]/.test(nextChar)
  if (joinsLatinWords) {
    return true
  }

  return gap > 12 && !/[，。！？；：,.!?;:)]/.test(nextChar)
}

function median(values: number[]) {
  if (values.length === 0) {
    return 0
  }

  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2
  }

  return sorted[middle]
}

async function readFileAsUint8Array(file: File) {
  const buffer = await file.arrayBuffer()
  return new Uint8Array(buffer)
}

async function resolveDestinationPage(document: PDFDocumentProxy, destination: PdfOutlineEntry['dest']) {
  if (!destination) {
    return null
  }

  const resolvedDestination =
    typeof destination === 'string'
      ? await document.getDestination(destination)
      : destination

  if (!Array.isArray(resolvedDestination) || resolvedDestination.length === 0) {
    return null
  }

  const pageReference = resolvedDestination[0]

  if (typeof pageReference === 'number') {
    return pageReference + 1
  }

  if (isPdfReference(pageReference)) {
    const pageIndex = await document.getPageIndex(pageReference)
    return pageIndex + 1
  }

  return null
}

async function collectEmbeddedOutline(
  document: PDFDocumentProxy,
  entries: PdfOutlineEntry[],
  level: number,
  nodes: PdfOutlineNode[],
  path: number[] = [],
) {
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    const title = entry.title.replace(/\s+/g, ' ').trim()

    if (!title) {
      continue
    }

    const pageNumber = await resolveDestinationPage(document, entry.dest)

    if (pageNumber !== null) {
      nodes.push({
        confidence: 1,
        id: `embedded-${[...path, index + 1].join('-')}`,
        level,
        pageNumber,
        source: 'embedded',
        title,
      })
    }

    if (entry.items && entry.items.length > 0) {
      await collectEmbeddedOutline(document, entry.items, level + 1, nodes, [...path, index + 1])
    }
  }
}

function buildPageLines(items: TextItem[], pageNumber: number) {
  const segments: TextSegment[] = items
    .filter(hasVisibleText)
    .map((item) => {
      const x = item.transform[4] ?? 0
      const y = item.transform[5] ?? 0
      const scaleX = Math.abs(item.transform[0] ?? 0)
      const scaleY = Math.abs(item.transform[3] ?? 0)
      const size = Math.max(scaleX, scaleY, Math.abs(item.height))

      return {
        fontName: item.fontName ?? '',
        height: Math.abs(item.height),
        size,
        text: item.str.trim(),
        width: Math.abs(item.width),
        x,
        y,
      }
    })
    .sort((left, right) => {
      if (Math.abs(left.y - right.y) > 1.5) {
        return right.y - left.y
      }

      return left.x - right.x
    })

  const rawLines: TextSegment[][] = []

  for (const segment of segments) {
    const currentLine = rawLines[rawLines.length - 1]
    const tolerance = Math.max(2, Math.min(8, segment.size * 0.45))

    if (!currentLine) {
      rawLines.push([segment])
      continue
    }

    const currentY = currentLine[0].y

    if (Math.abs(currentY - segment.y) <= tolerance) {
      currentLine.push(segment)
      continue
    }

    rawLines.push([segment])
  }

  return rawLines
    .map((lineSegments) => {
      const sortedSegments = [...lineSegments].sort((left, right) => left.x - right.x)
      let text = ''
      let previousEndX = 0

      for (const segment of sortedSegments) {
        const gap = segment.x - previousEndX

        if (text && shouldInsertSpace(text, segment.text, gap)) {
          text += ' '
        }

        text += segment.text
        previousEndX = segment.x + segment.width
      }

      return {
        fontName: sortedSegments.find((segment) => segment.fontName)?.fontName ?? '',
        pageNumber,
        size: Math.max(...sortedSegments.map((segment) => segment.size)),
        text: text.replace(/\s+/g, ' ').trim(),
        x: Math.min(...sortedSegments.map((segment) => segment.x)),
        y: median(sortedSegments.map((segment) => segment.y)),
      }
    })
    .filter((line) => line.text.length > 0)
}

function assignLevelFromSize(size: number, sizeBands: number[]) {
  for (let index = 0; index < sizeBands.length; index += 1) {
    if (Math.abs(sizeBands[index] - size) <= 0.75) {
      return index + 1
    }
  }

  return Math.min(sizeBands.length + 1, 4)
}

function buildSuggestedOutline(lines: TextLine[]) {
  const sizes = lines.map((line) => line.size)
  const medianSize = median(sizes)
  const candidateLines = lines
    .map((line) => {
      const explicitLevel = getNumberingLevel(line.text)
      let score = 0

      if (explicitLevel !== null) {
        score += 1.4
      }

      if (line.size >= medianSize * 1.18) {
        score += 1.15
      } else if (line.size >= medianSize * 1.08) {
        score += 0.65
      }

      if (line.text.length <= 36) {
        score += 0.45
      } else if (line.text.length <= 60) {
        score += 0.2
      }

      if (line.x <= 72) {
        score += 0.15
      }

      if (/bold|heavy|black|semibold/i.test(line.fontName)) {
        score += 0.25
      }

      if (/[。！？!?]$/.test(line.text)) {
        score -= 0.35
      }

      if (isLikelyBodyCopy(line.text)) {
        score -= 0.95
      }

      return {
        explicitLevel,
        line,
        score,
      }
    })
    .filter((candidate) => candidate.score >= 1.25)
    .filter((candidate, index, list) => {
      const previous = list[index - 1]

      if (!previous) {
        return true
      }

      return !(
        previous.line.pageNumber === candidate.line.pageNumber &&
        previous.line.text === candidate.line.text
      )
    })

  const sizeBands = [...new Set(candidateLines.map((candidate) => Math.round(candidate.line.size * 2) / 2))]
    .sort((left, right) => right - left)
    .slice(0, 3)

  return candidateLines.map((candidate, index) => ({
    confidence: Math.min(0.99, Number((candidate.score / 2.5).toFixed(2))),
    id: `detected-${index + 1}`,
    level:
      candidate.explicitLevel ??
      assignLevelFromSize(candidate.line.size, sizeBands),
    pageNumber: candidate.line.pageNumber,
    source: 'detected' as const,
    title: candidate.line.text,
  }))
}

export async function parsePdfOutline(file: File): Promise<ParsedPdfDocument> {
  const data = await readFileAsUint8Array(file)
  const document = await getDocument({ data }).promise
  const embeddedOutlineEntries = (await document.getOutline()) ?? []
  const embeddedOutline: PdfOutlineNode[] = []

  if (embeddedOutlineEntries.length > 0) {
    await collectEmbeddedOutline(document, embeddedOutlineEntries, 1, embeddedOutline)
  }

  const lines: TextLine[] = []

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const textContent = await page.getTextContent()
    lines.push(...buildPageLines(textContent.items.filter(isTextItem), pageNumber))
  }

  const suggestedOutline = buildSuggestedOutline(lines)
  const warnings: string[] = []

  if (suggestedOutline.length === 0) {
    warnings.push('No confident headings were detected. The document may be scanned or heavily styled.')
  }

  if (embeddedOutline.length > 0) {
    warnings.push('Existing PDF bookmarks were found. You can keep them, merge them, or replace them.')
  }

  return {
    analyzedLineCount: lines.length,
    embeddedOutline,
    extractedTitleCount: suggestedOutline.length,
    fileName: file.name,
    fileSize: file.size,
    fingerprint: document.fingerprints[0] ?? file.name,
    pageCount: document.numPages,
    suggestedOutline,
    warnings,
  }
}
