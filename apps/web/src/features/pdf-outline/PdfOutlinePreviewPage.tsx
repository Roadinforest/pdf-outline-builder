import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import type {
  CreateExportResponse,
  ExportJob,
  RefineCandidate,
  RefineResponse,
} from '@pdf-outline-builder/shared'
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Info,
  FileJson,
  FileUp,
  Plus,
  RefreshCw,
  ShieldAlert,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PreviewLayout } from '@/components/PreviewLayout'
import { apiUrl, postJson, readJsonOrThrow } from '@/lib/api'
import { uploadSourcePdf } from '@/lib/blobUpload'
import { parsePdfOutline, type ParsedPdfDocument, type PdfOutlineNode } from './pdfOutline'

type OutlinePreset = 'detected' | 'embedded' | 'merged'

interface OutlineTreeItem {
  children: OutlineTreeItem[]
  index: number
  node: PdfOutlineNode
}

interface OutlineTreeBranchProps {
  collapsedNodeIds: Set<string>
  expandedNodeIds: Set<string>
  items: OutlineTreeItem[]
  onAddChild: (index: number) => void
  onAddSibling: (index: number) => void
  onChangeLevel: (index: number, nextLevel: number) => void
  onMoveDown: (index: number) => void
  onMoveUp: (index: number) => void
  onRemove: (index: number) => void
  onToggleCollapse: (id: string) => void
  onToggleExpanded: (id: string) => void
  onUpdatePage: (index: number, pageNumber: number) => void
  onUpdateTitle: (index: number, title: string) => void
  pageCount: number
}

const defaultExportEndpoint = apiUrl('/api/outline/export')
const levelOptions = [1, 2, 3, 4]

function cloneNodes(nodes: PdfOutlineNode[]) {
  return nodes.map((node) => ({ ...node }))
}

function createManualNode(pageCount: number, level = 1): PdfOutlineNode {
  return {
    confidence: 1,
    id: `manual-${Math.random().toString(36).slice(2, 10)}`,
    level,
    pageNumber: Math.max(1, pageCount > 0 ? 1 : 0),
    source: 'manual',
    title: 'New section',
  }
}

function normalizeEditedSource(source: PdfOutlineNode['source']) {
  return source === 'embedded' ? 'manual' : source
}

function clampLevel(level: number) {
  return Math.max(1, Math.min(4, level))
}

function getSubtreeEnd(nodes: PdfOutlineNode[], startIndex: number) {
  const current = nodes[startIndex]

  if (!current) {
    return startIndex
  }

  let endIndex = startIndex + 1

  while (endIndex < nodes.length && nodes[endIndex].level > current.level) {
    endIndex += 1
  }

  return endIndex
}

function findPreviousSiblingIndex(nodes: PdfOutlineNode[], startIndex: number) {
  const current = nodes[startIndex]

  if (!current) {
    return null
  }

  for (let index = startIndex - 1; index >= 0; index -= 1) {
    if (nodes[index].level < current.level) {
      break
    }

    if (nodes[index].level === current.level) {
      return index
    }
  }

  return null
}

function findNextSiblingIndex(nodes: PdfOutlineNode[], startIndex: number) {
  const current = nodes[startIndex]

  if (!current) {
    return null
  }

  const subtreeEnd = getSubtreeEnd(nodes, startIndex)

  for (let index = subtreeEnd; index < nodes.length; index += 1) {
    if (nodes[index].level < current.level) {
      break
    }

    if (nodes[index].level === current.level) {
      return index
    }
  }

  return null
}

function moveBlock(nodes: PdfOutlineNode[], startIndex: number, targetIndex: number) {
  const subtreeEnd = getSubtreeEnd(nodes, startIndex)
  const block = nodes.slice(startIndex, subtreeEnd)

  if (targetIndex < startIndex) {
    return [
      ...nodes.slice(0, targetIndex),
      ...block,
      ...nodes.slice(targetIndex, startIndex),
      ...nodes.slice(subtreeEnd),
    ]
  }

  const targetEnd = getSubtreeEnd(nodes, targetIndex)

  return [
    ...nodes.slice(0, startIndex),
    ...nodes.slice(subtreeEnd, targetEnd),
    ...block,
    ...nodes.slice(targetEnd),
  ]
}

function mergeNodes(embedded: PdfOutlineNode[], detected: PdfOutlineNode[]) {
  const merged = [...embedded.map((node) => ({ ...node }))]
  const seen = new Set(embedded.map((node) => `${node.pageNumber}:${node.title.toLowerCase()}`))

  for (const node of detected) {
    const key = `${node.pageNumber}:${node.title.toLowerCase()}`

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    merged.push({ ...node })
  }

  return merged.sort((left, right) => {
    if (left.pageNumber !== right.pageNumber) {
      return left.pageNumber - right.pageNumber
    }

    if (left.level !== right.level) {
      return left.level - right.level
    }

    return left.title.localeCompare(right.title)
  })
}

function buildTree(nodes: PdfOutlineNode[]) {
  const roots: OutlineTreeItem[] = []
  const stack: OutlineTreeItem[] = []

  nodes.forEach((node, index) => {
    const item: OutlineTreeItem = {
      children: [],
      index,
      node,
    }

    while (stack.length > 0 && stack[stack.length - 1].node.level >= node.level) {
      stack.pop()
    }

    if (stack.length === 0) {
      roots.push(item)
    } else {
      stack[stack.length - 1].children.push(item)
    }

    stack.push(item)
  })

  return roots
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function buildExportPayload(document: ParsedPdfDocument, outline: PdfOutlineNode[]) {
  return {
    document: {
      fileName: document.fileName,
      fileSize: document.fileSize,
      fingerprint: document.fingerprint,
      pageCount: document.pageCount,
    },
    outline: outline.map((node, index) => ({
      id: node.id,
      level: node.level,
      order: index + 1,
      pageNumber: node.pageNumber,
      source: node.source,
      title: node.title.trim(),
    })),
  }
}

function deriveOutputFilename(fileName: string) {
  const extensionIndex = fileName.lastIndexOf('.')

  if (extensionIndex === -1) {
    return `${fileName}-outlined.pdf`
  }

  const baseName = fileName.slice(0, extensionIndex)
  return `${baseName}-outlined.pdf`
}

function wait(durationMs: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, durationMs)
  })
}

function downloadBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = objectUrl
  link.download = filename
  link.click()

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl)
  }, 0)
}

function downloadJson(payload: unknown, filename: string) {
  downloadBlob(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }),
    filename,
  )
}

function buildContractSnippet(endpoint: string) {
  return `POST ${endpoint}
Content-Type: application/json

{
  "sourceBlobUrl": "https://blob.vercel-storage.com/...",
  "document": { ... },
  "outline": [ ... ]
}

Successful response:
{ "jobId": "...", "status": "processing|completed" }`
}

function SummaryCard({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-3xl border border-zinc-200/70 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm">
      <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-zinc-900">{value}</p>
    </div>
  )
}

function ParsingOverlay({
  description,
  title,
}: {
  description: string
  title: string
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/78 backdrop-blur-sm">
      <div className="mx-6 w-full max-w-md rounded-[28px] border border-zinc-200/80 bg-white/95 px-6 py-8 text-center shadow-lg">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <RefreshCw className="size-6 animate-spin" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-zinc-950">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-zinc-600">{description}</p>
      </div>
    </div>
  )
}

function BlockingOverlay({
  description,
  title,
}: {
  description: string
  title: string
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/72 backdrop-blur-md">
      <div className="mx-6 w-full max-w-lg rounded-[32px] border border-zinc-200/80 bg-white/95 px-7 py-9 text-center shadow-xl">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <RefreshCw className="size-7 animate-spin" />
        </div>
        <h3 className="mt-5 text-xl font-semibold text-zinc-950">{title}</h3>
        <p className="mt-3 text-sm leading-6 text-zinc-600">{description}</p>
        <p className="mt-2 text-xs uppercase tracking-[0.2em] text-zinc-400">Please wait</p>
      </div>
    </div>
  )
}

type NotificationTone = 'success' | 'error'

function FloatingNotification({
  message,
  tone,
}: {
  message: string
  tone: NotificationTone
}) {
  const isSuccess = tone === 'success'

  return (
    <div className="fixed right-6 top-24 z-50 w-[min(420px,calc(100vw-3rem))] rounded-[28px] border border-zinc-200/80 bg-white/95 px-5 py-4 shadow-xl backdrop-blur-md">
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full ${
            isSuccess ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
          }`}
        >
          {isSuccess ? <CheckCircle2 className="size-5" /> : <ShieldAlert className="size-5" />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-950">
            {isSuccess ? 'AI refinement complete' : 'AI refinement failed'}
          </p>
          <p className="mt-1 text-sm leading-6 text-zinc-600">{message}</p>
        </div>
      </div>
    </div>
  )
}

function getIndentLabel(level: number) {
  if (level <= 1) {
    return 'Root'
  }

  return `Indent ${level - 1}`
}

function OutlineTreeBranch({
  collapsedNodeIds,
  expandedNodeIds,
  items,
  onAddChild,
  onAddSibling,
  onChangeLevel,
  onMoveDown,
  onMoveUp,
  onRemove,
  onToggleCollapse,
  onToggleExpanded,
  onUpdatePage,
  onUpdateTitle,
  pageCount,
}: OutlineTreeBranchProps) {
  return (
    <div className="space-y-3">
      {items.map((item) => {
        const isCollapsed = collapsedNodeIds.has(item.node.id)
        const isExpanded = expandedNodeIds.has(item.node.id)
        const hasChildren = item.children.length > 0

        return (
          <div key={item.node.id}>
            <div className={`rounded-3xl border border-zinc-200 bg-white shadow-sm transition ${isExpanded ? 'px-4 py-4' : 'px-4 py-3 hover:border-zinc-300'}`}>
              <div className="flex items-start gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <button
                    type="button"
                    onClick={() => hasChildren ? onToggleCollapse(item.node.id) : null}
                    className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-default disabled:opacity-40"
                    disabled={!hasChildren}
                    aria-label={hasChildren ? (isCollapsed ? 'Expand section' : 'Collapse section') : 'No child sections'}
                  >
                    {hasChildren ? (
                      isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />
                    ) : (
                      <span className="text-[10px]">•</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleExpanded(item.node.id)}
                    className="min-w-0 flex-1 rounded-2xl px-1 py-1 text-left transition hover:bg-zinc-50"
                    aria-expanded={isExpanded}
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.18em] text-zinc-500">
                      <span>H{item.node.level}</span>
                      <span>{getIndentLabel(item.node.level)}</span>
                    </div>
                    <p className="mt-2 break-words text-sm font-medium leading-6 text-zinc-900">
                      {item.node.title || 'Untitled section'}
                    </p>
                  </button>
                </div>
                {!isExpanded ? (
                  <Button
                    variant="destructive"
                    size="icon-sm"
                    onClick={() => onRemove(item.index)}
                    aria-label={`Remove ${item.node.title}`}
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </div>

              {isExpanded ? (
                <>
                  <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.18em] text-zinc-500">
                      <span>#{item.index + 1}</span>
                      <span>H{item.node.level}</span>
                      <span>{getIndentLabel(item.node.level)}</span>
                      <span>P{item.node.pageNumber}</span>
                      <span>{item.node.source}</span>
                      <span>{Math.round(item.node.confidence * 100)}%</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="xs" onClick={() => onMoveUp(item.index)}>
                        Up
                      </Button>
                      <Button variant="outline" size="xs" onClick={() => onMoveDown(item.index)}>
                        Down
                      </Button>
                      <Button variant="outline" size="xs" onClick={() => onChangeLevel(item.index, item.node.level - 1)}>
                        Outdent
                      </Button>
                      <Button variant="outline" size="xs" onClick={() => onChangeLevel(item.index, item.node.level + 1)}>
                        Indent
                      </Button>
                      <Button variant="outline" size="xs" onClick={() => onAddChild(item.index)}>
                        Child
                      </Button>
                      <Button variant="outline" size="xs" onClick={() => onAddSibling(item.index)}>
                        After
                      </Button>
                      <Button
                        variant="destructive"
                        size="icon-sm"
                        onClick={() => onRemove(item.index)}
                        aria-label={`Remove ${item.node.title}`}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-[120px,120px,1fr]">
                    <label className="flex flex-col gap-2 text-sm text-zinc-600">
                      Level
                      <select
                        value={item.node.level}
                        onChange={(event) => onChangeLevel(item.index, Number(event.target.value))}
                        className="h-10 rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none transition focus:border-zinc-400"
                      >
                        {levelOptions.map((level) => (
                          <option key={level} value={level}>
                            H{level}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-2 text-sm text-zinc-600">
                      Page
                      <input
                        type="number"
                        min={1}
                        max={pageCount}
                        value={item.node.pageNumber}
                        onChange={(event) => onUpdatePage(item.index, Number(event.target.value))}
                        className="h-10 rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none transition focus:border-zinc-400"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-sm text-zinc-600">
                      Title
                      <input
                        type="text"
                        value={item.node.title}
                        onChange={(event) => onUpdateTitle(item.index, event.target.value)}
                        className="h-10 rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none transition focus:border-zinc-400"
                      />
                    </label>
                  </div>
                </>
              ) : null}
            </div>

            {!isCollapsed && hasChildren ? (
              <div className="ml-4 mt-3 border-l border-dashed border-zinc-200 pl-4">
                <OutlineTreeBranch
                  collapsedNodeIds={collapsedNodeIds}
                  expandedNodeIds={expandedNodeIds}
                  items={item.children}
                  onAddChild={onAddChild}
                  onAddSibling={onAddSibling}
                  onChangeLevel={onChangeLevel}
                  onMoveDown={onMoveDown}
                  onMoveUp={onMoveUp}
                  onRemove={onRemove}
                  onToggleCollapse={onToggleCollapse}
                  onToggleExpanded={onToggleExpanded}
                  onUpdatePage={onUpdatePage}
                  onUpdateTitle={onUpdateTitle}
                  pageCount={pageCount}
                />
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export function PdfOutlinePreviewPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [documentUrl, setDocumentUrl] = useState('')
  const [parsedDocument, setParsedDocument] = useState<ParsedPdfDocument | null>(null)
  const [detectedOutlineNodes, setDetectedOutlineNodes] = useState<PdfOutlineNode[]>([])
  const [outlineNodes, setOutlineNodes] = useState<PdfOutlineNode[]>([])
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<string[]>([])
  const [expandedNodeIds, setExpandedNodeIds] = useState<string[]>([])
  const [activePreset, setActivePreset] = useState<OutlinePreset>('detected')
  const [isParsing, setIsParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [exportEndpoint, setExportEndpoint] = useState(defaultExportEndpoint)
  const [exportMessage, setExportMessage] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isCopyingPayload, setIsCopyingPayload] = useState(false)
  const [isRefining, setIsRefining] = useState(false)
  const [hasAiRefinedOutline, setHasAiRefinedOutline] = useState(false)
  const [notification, setNotification] = useState<{ message: string; tone: NotificationTone } | null>(null)
  const [lastExportDownloadUrl, setLastExportDownloadUrl] = useState('')
  const [lastExportJobId, setLastExportJobId] = useState('')
  const [sourceBlobUrl, setSourceBlobUrl] = useState('')

  useEffect(() => {
    return () => {
      if (documentUrl) {
        URL.revokeObjectURL(documentUrl)
      }
    }
  }, [documentUrl])

  useEffect(() => {
    if (!notification) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setNotification(null)
    }, 3200)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [notification])

  const collapsedNodeSet = useMemo(() => new Set(collapsedNodeIds), [collapsedNodeIds])
  const expandedNodeSet = useMemo(() => new Set(expandedNodeIds), [expandedNodeIds])
  const outlineTree = useMemo(() => buildTree(outlineNodes), [outlineNodes])
  const mergedOutlineCount = useMemo(() => {
    if (!parsedDocument) {
      return 0
    }

    return mergeNodes(parsedDocument.embeddedOutline, detectedOutlineNodes).length
  }, [detectedOutlineNodes, parsedDocument])
  const exportPayload = useMemo(() => {
    if (!parsedDocument) {
      return null
    }

    return buildExportPayload(parsedDocument, outlineNodes)
  }, [outlineNodes, parsedDocument])

  function resetCollapsedNodes() {
    setCollapsedNodeIds([])
  }

  function resetExpandedNodes() {
    setExpandedNodeIds([])
  }

  function resetTreeUiState() {
    resetCollapsedNodes()
    resetExpandedNodes()
  }

  function buildPresetNodes(preset: OutlinePreset, document: ParsedPdfDocument, detectedNodes: PdfOutlineNode[]) {
    if (preset === 'embedded') {
      return cloneNodes(document.embeddedOutline)
    }

    if (preset === 'merged') {
      return mergeNodes(document.embeddedOutline, detectedNodes)
    }

    return cloneNodes(detectedNodes)
  }

  function applyPresetState(preset: OutlinePreset, document: ParsedPdfDocument, detectedNodes: PdfOutlineNode[]) {
    setActivePreset(preset)
    setOutlineNodes(buildPresetNodes(preset, document, detectedNodes))
    resetTreeUiState()
  }

  async function loadFile(file: File) {
    setIsParsing(true)
    setParseError('')
    setExportMessage('')
    setLastExportDownloadUrl('')
    setLastExportJobId('')
    setSourceBlobUrl('')

    try {
      const parsed = await parsePdfOutline(file)
      const nextUrl = URL.createObjectURL(file)

      setDocumentUrl((currentUrl) => {
        if (currentUrl) {
          URL.revokeObjectURL(currentUrl)
        }

        return nextUrl
      })
      setSelectedFile(file)
      setParsedDocument(parsed)
      const nextDetectedNodes = cloneNodes(parsed.suggestedOutline)
      const nextPreset: OutlinePreset = parsed.embeddedOutline.length > 0 ? 'embedded' : 'detected'

      setHasAiRefinedOutline(false)
      setNotification(null)
      setDetectedOutlineNodes(nextDetectedNodes)
      applyPresetState(nextPreset, parsed, nextDetectedNodes)
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Failed to parse the PDF file.')
      setParsedDocument(null)
      setHasAiRefinedOutline(false)
      setNotification(null)
      setDetectedOutlineNodes([])
      setOutlineNodes([])
      setSourceBlobUrl('')
      resetTreeUiState()
    } finally {
      setIsParsing(false)
    }
  }

  function applyPreset(preset: OutlinePreset) {
    if (!parsedDocument) {
      return
    }

    applyPresetState(preset, parsedDocument, detectedOutlineNodes)
  }

  async function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    await loadFile(file)
    event.target.value = ''
  }

  function updateNodeAtIndex(index: number, patch: Partial<PdfOutlineNode>) {
    setOutlineNodes((nodes) =>
      nodes.map((node, nodeIndex) => {
        if (nodeIndex !== index) {
          return node
        }

        return { ...node, ...patch }
      }),
    )
  }

  function updateNodeTitle(index: number, title: string) {
    updateNodeAtIndex(index, {
      source: normalizeEditedSource(outlineNodes[index]?.source ?? 'manual'),
      title,
    })
  }

  function updateNodePage(index: number, pageNumber: number) {
    if (!parsedDocument) {
      return
    }

    updateNodeAtIndex(index, {
      pageNumber: Math.max(1, Math.min(parsedDocument.pageCount, Number.isFinite(pageNumber) ? pageNumber : 1)),
      source: normalizeEditedSource(outlineNodes[index]?.source ?? 'manual'),
    })
  }

  function changeNodeLevel(index: number, nextLevel: number) {
    setOutlineNodes((nodes) => {
      const current = nodes[index]

      if (!current) {
        return nodes
      }

      const targetLevel = clampLevel(nextLevel)
      const levelDelta = targetLevel - current.level

      if (levelDelta === 0) {
        return nodes
      }

      const subtreeEnd = getSubtreeEnd(nodes, index)

      return nodes.map((node, nodeIndex) => {
        if (nodeIndex < index || nodeIndex >= subtreeEnd) {
          return node
        }

        return {
          ...node,
          level: clampLevel(node.level + levelDelta),
          source: normalizeEditedSource(node.source),
        }
      })
    })
  }

  function moveNodeUp(index: number) {
    setOutlineNodes((nodes) => {
      const previousSiblingIndex = findPreviousSiblingIndex(nodes, index)

      if (previousSiblingIndex === null) {
        return nodes
      }

      return moveBlock(nodes, index, previousSiblingIndex)
    })
  }

  function moveNodeDown(index: number) {
    setOutlineNodes((nodes) => {
      const nextSiblingIndex = findNextSiblingIndex(nodes, index)

      if (nextSiblingIndex === null) {
        return nodes
      }

      return moveBlock(nodes, index, nextSiblingIndex)
    })
  }

  function removeNode(index: number) {
    setOutlineNodes((nodes) => {
      const subtreeEnd = getSubtreeEnd(nodes, index)
      const removedIds = new Set(nodes.slice(index, subtreeEnd).map((node) => node.id))

      setCollapsedNodeIds((currentIds) => currentIds.filter((id) => !removedIds.has(id)))

      return [...nodes.slice(0, index), ...nodes.slice(subtreeEnd)]
    })
  }

  function addRootNode() {
    setOutlineNodes((nodes) => [...nodes, createManualNode(parsedDocument?.pageCount ?? 1, 1)])
  }

  function addSiblingNode(index: number) {
    const current = outlineNodes[index]

    if (!current) {
      return
    }

    setOutlineNodes((nodes) => {
      const insertIndex = getSubtreeEnd(nodes, index)
      const nextNode = createManualNode(parsedDocument?.pageCount ?? 1, current.level)
      return [...nodes.slice(0, insertIndex), nextNode, ...nodes.slice(insertIndex)]
    })
  }

  function addChildNode(index: number) {
    const current = outlineNodes[index]

    if (!current) {
      return
    }

    setOutlineNodes((nodes) => {
      const insertIndex = getSubtreeEnd(nodes, index)
      const nextNode = createManualNode(parsedDocument?.pageCount ?? 1, clampLevel(current.level + 1))
      return [...nodes.slice(0, insertIndex), nextNode, ...nodes.slice(insertIndex)]
    })
    setCollapsedNodeIds((currentIds) => currentIds.filter((id) => id !== current.id))
  }

  function toggleCollapse(id: string) {
    setCollapsedNodeIds((currentIds) =>
      currentIds.includes(id)
        ? currentIds.filter((currentId) => currentId !== id)
        : [...currentIds, id],
    )
  }

  function toggleExpanded(id: string) {
    setExpandedNodeIds((currentIds) =>
      currentIds.includes(id)
        ? currentIds.filter((currentId) => currentId !== id)
        : [...currentIds, id],
    )
  }

  function collapseAllNodes() {
    setCollapsedNodeIds(outlineNodes.map((node) => node.id))
  }

  function expandAllNodes() {
    resetCollapsedNodes()
  }

  function handleDownloadPayload() {
    if (!exportPayload || !parsedDocument) {
      return
    }

    const baseName = parsedDocument.fileName.replace(/\.pdf$/i, '')
    downloadJson(exportPayload, `${baseName || 'pdf-outline'}-payload.json`)
  }

  async function handleCopyPayload() {
    if (!exportPayload) {
      return
    }

    setIsCopyingPayload(true)

    try {
      await navigator.clipboard.writeText(JSON.stringify(exportPayload, null, 2))
      setExportMessage('Payload copied. You can inspect or replay the JSON contract directly.')
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : 'Failed to copy payload.')
    } finally {
      setIsCopyingPayload(false)
    }
  }

  async function waitForCompletedJob(jobId: string) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const response = await fetch(apiUrl(`/api/jobs/${jobId}`))
      const job = await readJsonOrThrow<ExportJob>(response)

      if (job.status === 'completed' && job.downloadUrl) {
        return job
      }

      if (job.status === 'failed') {
        throw new Error(job.error ?? 'Export job failed.')
      }

      await wait(1500)
    }

    throw new Error('Export job is still processing. Open the job page and continue there.')
  }

  async function loadExportedPdf(downloadUrl: string, fileName: string) {
    setExportMessage('Downloading exported PDF and reloading the workspace...')

    const response = await fetch(downloadUrl)

    if (!response.ok) {
      throw new Error(`Could not download exported PDF (${response.status}).`)
    }

    const pdfBlob = await response.blob()
    const outputFileName = deriveOutputFilename(fileName)
    downloadBlob(pdfBlob, outputFileName)

    const outlinedFile = new File([pdfBlob], outputFileName, {
      type: 'application/pdf',
    })

    await loadFile(outlinedFile)
    setExportMessage('Outlined PDF downloaded and loaded into the builder.')
  }

  async function handleRefineOutline() {
    if (!parsedDocument || outlineNodes.length === 0) {
      return
    }

    setIsRefining(true)
    setExportMessage('Asking the LLM to filter and clean the outline...')

    try {
      const candidates: RefineCandidate[] = outlineNodes.map((node) => ({
        confidence: node.confidence,
        id: node.id,
        level: node.level,
        pageNumber: node.pageNumber,
        title: node.title,
      }))

      const response = await postJson<{ candidates: RefineCandidate[]; fileName?: string }, RefineResponse>(
        '/api/outline/refine',
        {
          candidates,
          fileName: parsedDocument.fileName,
        },
      )

      const refined = response.outline.map<PdfOutlineNode>((node, index) => ({
        confidence: 1,
        id: `refined-${index + 1}`,
        level: Math.max(1, Math.min(4, node.level)),
        pageNumber: node.pageNumber,
        source: 'detected',
        title: node.title,
      }))

      if (refined.length === 0) {
        setExportMessage('The LLM returned an empty outline. The original list is preserved.')
        setNotification({
          message: 'The AI returned an empty outline, so the current tree was kept as-is.',
          tone: 'error',
        })
        return
      }

      const nextDetectedNodes = cloneNodes(refined)
      setHasAiRefinedOutline(true)
      setDetectedOutlineNodes(nextDetectedNodes)
      applyPresetState('detected', parsedDocument, nextDetectedNodes)
      const dropped = outlineNodes.length - refined.length
      const summary = response.reasoning
        ? `AI refinement complete (${refined.length} kept${dropped > 0 ? `, ${dropped} dropped` : ''}). ${response.reasoning}`
        : `AI refinement complete (${refined.length} kept${dropped > 0 ? `, ${dropped} dropped` : ''}).`
      setExportMessage(summary)
      setNotification({
        message: dropped > 0
          ? `Updated the outline tree with ${refined.length} AI-cleaned headings and removed ${dropped} lower-quality entries.`
          : `Updated the outline tree with ${refined.length} AI-cleaned headings.`,
        tone: 'success',
      })
    } catch (error) {
      setHasAiRefinedOutline(false)
      setNotification({
        message: error instanceof Error ? error.message : 'The outline could not be refined this time.',
        tone: 'error',
      })
      setExportMessage(
        error instanceof Error
          ? `${error.message} The original outline is unchanged.`
          : 'AI refinement failed. The original outline is unchanged.',
      )
    } finally {
      setIsRefining(false)
    }
  }

  async function handleExport() {
    if (!selectedFile || !parsedDocument || !exportPayload) {
      return
    }

    setIsExporting(true)
    setExportMessage('')

    try {
      let nextSourceBlobUrl = sourceBlobUrl

      if (!nextSourceBlobUrl) {
        setIsUploading(true)
        setExportMessage('Uploading source PDF...')

        const uploadResult = await uploadSourcePdf(selectedFile)
        nextSourceBlobUrl = uploadResult.url
        setSourceBlobUrl(nextSourceBlobUrl)
      }

      setExportMessage('Submitting export job...')

      const response = await fetch(exportEndpoint, {
        body: JSON.stringify({
          ...exportPayload,
          sourceBlobUrl: nextSourceBlobUrl,
        }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      })

      const responseBody = await readJsonOrThrow<CreateExportResponse>(response)
      setLastExportJobId(responseBody.jobId)

      const completedJob =
        responseBody.status === 'completed' && responseBody.downloadUrl
          ? {
              downloadUrl: responseBody.downloadUrl,
              id: responseBody.jobId,
            }
          : await waitForCompletedJob(responseBody.jobId)

      const completedDownloadUrl = completedJob.downloadUrl

      if (!completedDownloadUrl) {
        throw new Error('Export finished without a downloadable PDF.')
      }

      await loadExportedPdf(completedDownloadUrl, parsedDocument.fileName)
      setLastExportDownloadUrl(completedDownloadUrl)
      setLastExportJobId(responseBody.jobId)
    } catch (error) {
      setExportMessage(
        error instanceof Error
          ? `${error.message} You can still download the JSON payload for manual export testing.`
          : 'Export failed.',
      )
    } finally {
      setIsUploading(false)
      setIsExporting(false)
    }
  }

  return (
    <>
      <PreviewLayout
        title="PDF Outline Studio"
        actions={
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFileSelection}
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isRefining}>
              <FileUp />
              Upload PDF
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleRefineOutline()}
              disabled={isRefining || outlineNodes.length === 0}
            >
              <Sparkles className={isRefining ? 'animate-pulse' : undefined} />
              {isRefining ? 'Refining...' : 'AI Analyse'}
            </Button>
            <Button variant="outline" onClick={handleDownloadPayload} disabled={!exportPayload || isRefining}>
              <FileJson />
              Download Payload
            </Button>
            <Button onClick={handleExport} disabled={!exportPayload || isExporting || isUploading || isRefining}>
              <Send />
              {isUploading ? 'Uploading...' : isExporting ? 'Exporting & Loading...' : 'Export & Load PDF'}
            </Button>
          </>
        }
      >
        <div className="h-full overflow-auto px-6 py-6" aria-busy={isRefining}>
        <div className="mx-auto flex max-w-[1600px] flex-col gap-6">
          <section className="rounded-[32px] border border-zinc-200/70 bg-white/85 p-6 shadow-sm backdrop-blur-sm">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Browser First</p>
                <h2 className="mt-2 text-3xl font-semibold text-zinc-950">Parse locally, export only once</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
                  This flow keeps PDF reading, text extraction, outline guessing, and manual edits inside the
                  browser. The backend only receives the uploaded source blob URL plus your approved outline when it
                  is time to write bookmarks back into the file.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isRefining}>
                  <FileUp />
                  Choose a PDF
                </Button>
                {selectedFile ? (
                  <Button variant="outline" onClick={() => void loadFile(selectedFile)} disabled={isParsing || isRefining}>
                    <RefreshCw className={isParsing || isRefining ? 'animate-spin' : undefined} />
                    Re-run detection
                  </Button>
                ) : null}
              </div>
            </div>

            {selectedFile ? (
              <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-zinc-600">
                <span className="rounded-full bg-zinc-100 px-3 py-1">{selectedFile.name}</span>
                <span className="rounded-full bg-zinc-100 px-3 py-1">{formatBytes(selectedFile.size)}</span>
                {parsedDocument ? (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-900">
                    {parsedDocument.pageCount} pages
                  </span>
                ) : null}
                {sourceBlobUrl ? (
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-900">
                    Source uploaded
                  </span>
                ) : null}
                {lastExportJobId ? (
                  <Link
                    to={`/jobs/${lastExportJobId}`}
                    className="rounded-full bg-sky-100 px-3 py-1 text-sky-900 transition hover:bg-sky-200"
                  >
                    Job #{lastExportJobId.slice(0, 8)}
                  </Link>
                ) : null}
              </div>
            ) : null}

            {parseError ? (
              <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {parseError}
              </p>
            ) : null}

            {exportMessage ? (
              <p className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
                {exportMessage}
              </p>
            ) : null}
          </section>

          {parsedDocument ? (
            <>
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SummaryCard label="Pages" value={String(parsedDocument.pageCount)} />
                <SummaryCard label="Analyzed Lines" value={String(parsedDocument.analyzedLineCount)} />
                <SummaryCard label="Detected Headings" value={String(detectedOutlineNodes.length)} />
                <SummaryCard label="Embedded Bookmarks" value={String(parsedDocument.embeddedOutline.length)} />
              </section>

              <section className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
                <div className="relative h-[720px] overflow-hidden rounded-[32px] border border-zinc-200/70 bg-white/85 shadow-sm backdrop-blur-sm">
                  <div className="border-b border-zinc-200/70 px-5 py-4">
                    <h3 className="text-lg font-semibold text-zinc-950">Document preview</h3>
                    <p className="mt-1 text-sm text-zinc-600">
                      The PDF stays local until you export. Use this view to compare pages against the outline.
                    </p>
                  </div>
                  {documentUrl ? (
                    <iframe title="PDF preview" src={documentUrl} className="h-[680px] w-full bg-zinc-100" />
                  ) : (
                    <div className="flex h-[680px] items-center justify-center text-sm text-zinc-500">
                      No preview available.
                    </div>
                  )}
                  {isParsing ? (
                    <ParsingOverlay
                      title="Analyzing PDF"
                      description="Extracting text, checking embedded bookmarks, and generating a candidate outline."
                    />
                  ) : null}
                </div>

                <div className="relative flex h-[720px] min-h-0 flex-col overflow-hidden rounded-[32px] border border-zinc-200/70 bg-white/85 shadow-sm backdrop-blur-sm">
                  <div className="border-b border-zinc-200/70 px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-zinc-950">Outline tree editor</h3>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                              hasAiRefinedOutline
                                ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-200'
                                : 'bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200'
                            }`}
                          >
                            <Info className="size-3.5" />
                            AI Version
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-zinc-600">
                          Edit the hierarchy directly as a tree. Reordering keeps whole branches together.
                        </p>
                      </div>
                      <Button variant="outline" onClick={addRootNode}>
                        <Plus />
                        Add root
                      </Button>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        variant={activePreset === 'detected' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => applyPreset('detected')}
                      >
                        <Sparkles />
                        Detected ({detectedOutlineNodes.length})
                      </Button>
                      <Button
                        variant={activePreset === 'embedded' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => applyPreset('embedded')}
                        disabled={parsedDocument.embeddedOutline.length === 0}
                      >
                        Embedded ({parsedDocument.embeddedOutline.length})
                      </Button>
                      <Button
                        variant={activePreset === 'merged' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => applyPreset('merged')}
                      >
                        Merged ({mergedOutlineCount})
                      </Button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={expandAllNodes}>
                        Expand all
                      </Button>
                      <Button variant="outline" size="sm" onClick={collapseAllNodes}>
                        Collapse all
                      </Button>
                    </div>
                  </div>

                  {parsedDocument.warnings.length > 0 ? (
                    <div className="border-b border-zinc-200/70 bg-amber-50/80 px-5 py-4">
                      <div className="space-y-2 text-sm text-amber-900">
                        {parsedDocument.warnings.map((warning) => (
                          <p key={warning}>{warning}</p>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="border-b border-zinc-200/70 bg-zinc-50/80 px-5 py-3 text-sm text-zinc-600">
                    Order still follows the export sequence, but you now edit it as nested branches instead of one long flat list.
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    {outlineNodes.length === 0 ? (
                      <div className="rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-6 text-sm text-zinc-600">
                        No outline nodes yet. Try the detected preset or add a root section.
                      </div>
                    ) : (
                      <OutlineTreeBranch
                        collapsedNodeIds={collapsedNodeSet}
                        expandedNodeIds={expandedNodeSet}
                        items={outlineTree}
                        onAddChild={addChildNode}
                        onAddSibling={addSiblingNode}
                        onChangeLevel={changeNodeLevel}
                        onMoveDown={moveNodeDown}
                        onMoveUp={moveNodeUp}
                        onRemove={removeNode}
                        onToggleCollapse={toggleCollapse}
                        onToggleExpanded={toggleExpanded}
                        onUpdatePage={updateNodePage}
                        onUpdateTitle={updateNodeTitle}
                        pageCount={parsedDocument.pageCount}
                      />
                    )}
                  </div>
                  {isParsing ? (
                    <ParsingOverlay
                      title="Building outline"
                      description="Scoring headings by size, numbering, and layout so the editor can open with a usable tree."
                    />
                  ) : null}
                </div>
              </section>

              <section className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
                <div className="rounded-[32px] border border-zinc-200/70 bg-white/85 p-6 shadow-sm backdrop-blur-sm">
                  <h3 className="text-lg font-semibold text-zinc-950">Export contract</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    Keep the server tiny: upload the original file once, then send the blob URL and approved outline
                    as JSON so the API only needs to write bookmarks and store the result.
                  </p>
                  {lastExportDownloadUrl ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <a href={lastExportDownloadUrl} target="_blank" rel="noreferrer">
                        <Button variant="outline" size="sm">
                          <Download />
                          Open exported PDF
                        </Button>
                      </a>
                      {lastExportJobId ? (
                        <Link to={`/jobs/${lastExportJobId}`}>
                          <Button variant="outline" size="sm">Open job details</Button>
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                  <label className="mt-4 flex flex-col gap-2 text-sm text-zinc-600">
                    Backend endpoint
                    <input
                      type="text"
                      value={exportEndpoint}
                      onChange={(event) => setExportEndpoint(event.target.value)}
                      className="h-11 rounded-2xl border border-zinc-200 bg-white px-4 text-sm text-zinc-800 outline-none transition focus:border-zinc-400"
                    />
                  </label>
                  <pre className="mt-4 overflow-auto rounded-3xl bg-zinc-950 px-4 py-4 text-xs leading-6 text-zinc-100">
                    {buildContractSnippet(exportEndpoint)}
                  </pre>
                </div>

                <div className="rounded-[32px] border border-zinc-200/70 bg-white/85 p-6 shadow-sm backdrop-blur-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-zinc-950">Payload preview</h3>
                      <p className="mt-2 text-sm leading-6 text-zinc-600">
                        This is the exact structured data your lightweight export service needs before `sourceBlobUrl`
                        is added at submit time.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={handleCopyPayload} disabled={!exportPayload || isCopyingPayload}>
                        <Download />
                        {isCopyingPayload ? 'Copying...' : 'Copy JSON'}
                      </Button>
                      <Button variant="outline" onClick={handleDownloadPayload} disabled={!exportPayload}>
                        <FileJson />
                        Save JSON
                      </Button>
                    </div>
                  </div>
                  <pre className="mt-4 max-h-[420px] overflow-auto rounded-3xl bg-zinc-950 px-4 py-4 text-xs leading-6 text-zinc-100">
                    {JSON.stringify(exportPayload, null, 2)}
                  </pre>
                </div>
              </section>
            </>
          ) : (
            <section className="relative rounded-[32px] border border-dashed border-zinc-300 bg-white/70 px-6 py-10 text-center shadow-sm backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">MVP Flow</p>
              <h2 className="mt-2 text-2xl font-semibold text-zinc-950">Upload a PDF to start a browser-side pass</h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
                The page will inspect existing bookmarks, extract text with PDF.js, infer a heading structure, and
                prepare a clean payload for the export service that writes bookmarks back into the final PDF.
              </p>
              <div className="mt-6 flex justify-center">
                <Button onClick={() => fileInputRef.current?.click()} disabled={isParsing}>
                  <FileUp />
                  {isParsing ? 'Analyzing...' : 'Choose a PDF'}
                </Button>
              </div>
              {isParsing ? (
                <ParsingOverlay
                  title="Reading your PDF"
                  description="The browser is loading pages, extracting text, and preparing the initial outline."
                />
              ) : null}
            </section>
          )}
        </div>
        </div>
      </PreviewLayout>
      {isRefining ? (
        <BlockingOverlay
          title="AI is refining the outline"
          description="Filtering headings, cleaning titles, and rebuilding the detected outline. Other actions are temporarily disabled to keep the editor state consistent."
        />
      ) : null}
      {notification ? <FloatingNotification message={notification.message} tone={notification.tone} /> : null}
    </>
  )
}
