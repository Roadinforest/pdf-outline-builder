import {
  MAX_OUTLINE_NODES,
  exportRequestSchema,
  type ExportOutlineNode,
  type ExportRequest,
} from '@pdf-outline-builder/shared'

function assertValidLevelProgression(outline: ExportOutlineNode[]) {
  let previousLevel = 0

  outline.forEach((node, index) => {
    if (node.pageNumber < 1) {
      throw new Error(`Outline node ${node.id} has an invalid page number.`)
    }

    if (node.level > previousLevel + 1 && index > 0) {
      throw new Error(`Outline level jumps too far at node "${node.title}".`)
    }

    previousLevel = node.level
  })
}

function assertWithinPageBounds(payload: ExportRequest) {
  payload.outline.forEach((node) => {
    if (node.pageNumber > payload.document.pageCount) {
      throw new Error(`Outline node "${node.title}" points past the end of the document.`)
    }
  })
}

export function validateExportRequest(input: unknown) {
  const payload = exportRequestSchema.parse(input)

  if (payload.outline.length > MAX_OUTLINE_NODES) {
    throw new Error('Outline exceeds the supported node limit.')
  }

  const outline = [...payload.outline].sort((left, right) => left.order - right.order)
  const normalizedPayload: ExportRequest = {
    ...payload,
    outline,
  }

  assertWithinPageBounds(normalizedPayload)
  assertValidLevelProgression(normalizedPayload.outline)

  return normalizedPayload
}
