import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNull,
  PDFNumber,
  PDFPageLeaf,
  type PDFRef,
} from 'pdf-lib'
import type { ExportOutlineNode } from '@pdf-outline-builder/shared'

interface OutlineTreeNode {
  children: OutlineTreeNode[]
  item: ExportOutlineNode
  ref: PDFRef
}

function buildOutlineTree(outline: ExportOutlineNode[], document: PDFDocument) {
  const roots: OutlineTreeNode[] = []
  const stack: OutlineTreeNode[] = []

  outline.forEach((item) => {
    const treeNode: OutlineTreeNode = {
      children: [],
      item,
      ref: document.context.nextRef(),
    }

    while (stack.length > 0 && stack[stack.length - 1].item.level >= item.level) {
      stack.pop()
    }

    if (stack.length === 0) {
      roots.push(treeNode)
    } else {
      stack[stack.length - 1].children.push(treeNode)
    }

    stack.push(treeNode)
  })

  return roots
}

function countVisibleDescendants(node: OutlineTreeNode): number {
  return node.children.reduce((count, child) => count + 1 + countVisibleDescendants(child), 0)
}

function countVisibleRoots(nodes: OutlineTreeNode[]) {
  return nodes.reduce((count, node) => count + 1 + countVisibleDescendants(node), 0)
}

function getPageRefs(document: PDFDocument) {
  const refs: PDFRef[] = []

  document.catalog.Pages().traverse((kid, ref) => {
    if (kid instanceof PDFPageLeaf) {
      refs.push(ref)
    }
  })

  return refs
}

function createDestination(document: PDFDocument, pageRef: PDFRef) {
  const destination = PDFArray.withContext(document.context)
  destination.push(pageRef)
  destination.push(PDFName.of('XYZ'))
  destination.push(PDFNull)
  destination.push(PDFNull)
  destination.push(PDFNull)
  return destination
}

function assignOutlineItems(
  document: PDFDocument,
  parentRef: PDFRef,
  nodes: OutlineTreeNode[],
  pageRefs: PDFRef[],
) {
  nodes.forEach((node, index) => {
    const next = nodes[index + 1]
    const previous = nodes[index - 1]
    const targetPageRef = pageRefs[node.item.pageNumber - 1]

    if (!targetPageRef) {
      throw new Error(`Outline node "${node.item.title}" points to a missing page.`)
    }

    const dictMap = new Map()
    dictMap.set(PDFName.of('Title'), PDFHexString.fromText(node.item.title))
    dictMap.set(PDFName.of('Parent'), parentRef)
    dictMap.set(PDFName.of('Dest'), createDestination(document, targetPageRef))

    if (previous) {
      dictMap.set(PDFName.of('Prev'), previous.ref)
    }

    if (next) {
      dictMap.set(PDFName.of('Next'), next.ref)
    }

    if (node.children.length > 0) {
      dictMap.set(PDFName.of('First'), node.children[0].ref)
      dictMap.set(PDFName.of('Last'), node.children[node.children.length - 1].ref)
      dictMap.set(PDFName.of('Count'), PDFNumber.of(countVisibleDescendants(node)))
    }

    const outlineItem = PDFDict.fromMapWithContext(dictMap, document.context)
    document.context.assign(node.ref, outlineItem)

    if (node.children.length > 0) {
      assignOutlineItems(document, node.ref, node.children, pageRefs)
    }
  })
}

export async function applyOutlineToPdf(sourceBytes: Uint8Array, outline: ExportOutlineNode[]) {
  const document = await PDFDocument.load(sourceBytes, {
    updateMetadata: false,
  })

  const roots = buildOutlineTree(outline, document)
  const pageRefs = getPageRefs(document)
  const outlinesRef = document.context.nextRef()

  assignOutlineItems(document, outlinesRef, roots, pageRefs)

  const outlinesDict = PDFDict.fromMapWithContext(
    new Map<PDFName, PDFName | PDFRef | PDFNumber>([
      [PDFName.of('Type'), PDFName.of('Outlines')],
      [PDFName.of('First'), roots[0].ref],
      [PDFName.of('Last'), roots[roots.length - 1].ref],
      [PDFName.of('Count'), PDFNumber.of(countVisibleRoots(roots))],
    ]),
    document.context,
  )

  document.context.assign(outlinesRef, outlinesDict)
  document.catalog.set(PDFName.of('Outlines'), outlinesRef)
  document.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'))

  return document.save()
}
