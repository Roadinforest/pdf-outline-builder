import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileJson,
  FileUp,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PreviewLayout } from './PreviewLayout'
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

const defaultExportEndpoint = '/api/pdf-outline/export'
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
Content-Type: multipart/form-data

file: <original pdf binary>
outline: <json string>
document: <json string>

Successful response:
- application/pdf -> download the outlined PDF
- application/json -> return { "downloadUrl": "...", "message": "..." }`
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
  const [outlineNodes, setOutlineNodes] = useState<PdfOutlineNode[]>([])
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<string[]>([])
  const [expandedNodeIds, setExpandedNodeIds] = useState<string[]>([])
  const [activePreset, setActivePreset] = useState<OutlinePreset>('detected')
  const [isParsing, setIsParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [exportEndpoint, setExportEndpoint] = useState(defaultExportEndpoint)
  const [exportMessage, setExportMessage] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [isCopyingPayload, setIsCopyingPayload] = useState(false)

  useEffect(() => {
    return () => {
      if (documentUrl) {
        URL.revokeObjectURL(documentUrl)
      }
    }
  }, [documentUrl])

  const collapsedNodeSet = useMemo(() => new Set(collapsedNodeIds), [collapsedNodeIds])
  const expandedNodeSet = useMemo(() => new Set(expandedNodeIds), [expandedNodeIds])
  const outlineTree = useMemo(() => buildTree(outlineNodes), [outlineNodes])
  const mergedOutlineCount = useMemo(() => {
    if (!parsedDocument) {
      return 0
    }

    return mergeNodes(parsedDocument.embeddedOutline, parsedDocument.suggestedOutline).length
  }, [parsedDocument])
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

  async function loadFile(file: File) {
    setIsParsing(true)
    setParseError('')
    setExportMessage('')

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
      resetCollapsedNodes()
      resetExpandedNodes()

      if (parsed.embeddedOutline.length > 0) {
        setActivePreset('embedded')
        setOutlineNodes(cloneNodes(parsed.embeddedOutline))
      } else {
        setActivePreset('detected')
        setOutlineNodes(cloneNodes(parsed.suggestedOutline))
      }
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Failed to parse the PDF file.')
      setParsedDocument(null)
      setOutlineNodes([])
      resetCollapsedNodes()
      resetExpandedNodes()
    } finally {
      setIsParsing(false)
    }
  }

  function applyPreset(preset: OutlinePreset) {
    if (!parsedDocument) {
      return
    }

    setActivePreset(preset)
    resetCollapsedNodes()
    resetExpandedNodes()

    if (preset === 'embedded') {
      setOutlineNodes(cloneNodes(parsedDocument.embeddedOutline))
      return
    }

    if (preset === 'merged') {
      setOutlineNodes(mergeNodes(parsedDocument.embeddedOutline, parsedDocument.suggestedOutline))
      return
    }

    setOutlineNodes(cloneNodes(parsedDocument.suggestedOutline))
  }

  async function handleFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
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
      setExportMessage('Payload copied. You can hand it to the export service directly.')
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : 'Failed to copy payload.')
    } finally {
      setIsCopyingPayload(false)
    }
  }

  async function handleExport() {
    if (!selectedFile || !parsedDocument || !exportPayload) {
      return
    }

    setIsExporting(true)
    setExportMessage('')

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('outline', JSON.stringify(exportPayload.outline))
      formData.append('document', JSON.stringify(exportPayload.document))

      const response = await fetch(exportEndpoint, {
        body: formData,
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error(`Export service returned ${response.status}.`)
      }

      const contentType = response.headers.get('content-type') ?? ''

      if (contentType.includes('application/pdf')) {
        const pdfBlob = await response.blob()
        downloadBlob(pdfBlob, deriveOutputFilename(parsedDocument.fileName))
        setExportMessage('Outlined PDF downloaded.')
        return
      }

      const responseBody = await response.json() as {
        downloadUrl?: string
        message?: string
      }

      if (responseBody.downloadUrl) {
        window.open(responseBody.downloadUrl, '_blank', 'noopener,noreferrer')
      }

      setExportMessage(responseBody.message ?? 'Export service responded successfully.')
    } catch (error) {
      setExportMessage(
        error instanceof Error
          ? `${error.message} If the backend is not ready yet, download the payload JSON instead.`
          : 'Export failed.',
      )
    } finally {
      setIsExporting(false)
    }
  }

  return (
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
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <FileUp />
            Upload PDF
          </Button>
          <Button variant="outline" onClick={handleDownloadPayload} disabled={!exportPayload}>
            <FileJson />
            Download Payload
          </Button>
          <Button onClick={handleExport} disabled={!exportPayload || isExporting}>
            <Send />
            {isExporting ? 'Exporting...' : 'Export to Backend'}
          </Button>
        </>
      }
    >
      <div className="h-full overflow-auto px-6 py-6">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-6">
          <section className="rounded-[32px] border border-zinc-200/70 bg-white/85 p-6 shadow-sm backdrop-blur-sm">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Browser First</p>
                <h2 className="mt-2 text-3xl font-semibold text-zinc-950">Parse locally, export only once</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
                  This flow keeps PDF reading, text extraction, outline guessing, and manual edits inside the
                  browser. The backend only receives the original PDF plus your approved outline when it is time to
                  write bookmarks back into the file.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <FileUp />
                  Choose a PDF
                </Button>
                {selectedFile ? (
                  <Button variant="outline" onClick={() => void loadFile(selectedFile)} disabled={isParsing}>
                    <RefreshCw className={isParsing ? 'animate-spin' : undefined} />
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
                <SummaryCard label="Detected Headings" value={String(parsedDocument.suggestedOutline.length)} />
                <SummaryCard label="Embedded Bookmarks" value={String(parsedDocument.embeddedOutline.length)} />
              </section>

              <section className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
                <div className="min-h-[720px] overflow-hidden rounded-[32px] border border-zinc-200/70 bg-white/85 shadow-sm backdrop-blur-sm">
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
                </div>

                <div className="flex min-h-[720px] flex-col overflow-hidden rounded-[32px] border border-zinc-200/70 bg-white/85 shadow-sm backdrop-blur-sm">
                  <div className="border-b border-zinc-200/70 px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-zinc-950">Outline tree editor</h3>
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
                        Detected ({parsedDocument.suggestedOutline.length})
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

                  <div className="flex-1 overflow-auto px-5 py-4">
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
                </div>
              </section>

              <section className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
                <div className="rounded-[32px] border border-zinc-200/70 bg-white/85 p-6 shadow-sm backdrop-blur-sm">
                  <h3 className="text-lg font-semibold text-zinc-950">Export contract</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    Keep the server tiny: accept the original file plus the approved outline, write standard PDF
                    bookmarks, then return the new file.
                  </p>
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
                        This is the exact structured data your lightweight export service needs.
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
            <section className="rounded-[32px] border border-dashed border-zinc-300 bg-white/70 px-6 py-10 text-center shadow-sm backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">MVP Flow</p>
              <h2 className="mt-2 text-2xl font-semibold text-zinc-950">Upload a PDF to start a browser-side pass</h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
                The page will inspect existing bookmarks, extract text with PDF.js, infer a heading structure, and
                prepare a clean payload for the export service that writes bookmarks back into the final PDF.
              </p>
              <div className="mt-6 flex justify-center">
                <Button onClick={() => fileInputRef.current?.click()}>
                  <FileUp />
                  Choose a PDF
                </Button>
              </div>
            </section>
          )}
        </div>
      </div>
    </PreviewLayout>
  )
}
