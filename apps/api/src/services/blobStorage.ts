import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { put } from '@vercel/blob'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { MAX_PDF_SIZE_BYTES } from '@pdf-outline-builder/shared'
import { getConfiguredBaseUrl, getStorageMode } from '../lib/env.js'

const localStorageRoot = path.resolve(process.cwd(), '.local-storage')

function sanitizeFilename(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'document.pdf'
}

function createStoragePath(scope: 'exports' | 'uploads', fileName: string) {
  return `${scope}/${randomUUID()}-${sanitizeFilename(fileName)}`
}

function resolveLocalPath(relativePath: string) {
  const normalized = relativePath.replace(/^\/+/, '')
  const diskPath = path.resolve(localStorageRoot, normalized)

  if (!diskPath.startsWith(localStorageRoot)) {
    throw new Error('Invalid local storage path.')
  }

  return diskPath
}

async function storeLocalFile(request: Request, scope: 'exports' | 'uploads', fileName: string, bytes: Uint8Array) {
  const relativePath = createStoragePath(scope, fileName)
  const diskPath = resolveLocalPath(relativePath)

  await mkdir(path.dirname(diskPath), { recursive: true })
  await writeFile(diskPath, bytes)

  return {
    pathname: relativePath,
    url: `${getConfiguredBaseUrl(request)}/api/files/${relativePath}`,
  }
}

export async function createBlobClientUploadResponse(request: Request, body: HandleUploadBody) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not configured. Use the local upload fallback in development.')
  }

  return handleUpload({
    body,
    onBeforeGenerateToken: async (pathname) => {
      if (!pathname.endsWith('.pdf')) {
        throw new Error('Only PDF uploads are allowed.')
      }

      return {
        addRandomSuffix: true,
        allowedContentTypes: ['application/pdf'],
      }
    },
    onUploadCompleted: async () => {
      // Job metadata persistence can be added here later.
    },
    request,
  })
}

export async function createLocalUpload(request: Request, file: File) {
  if (file.type !== 'application/pdf') {
    throw new Error('Only PDF uploads are allowed.')
  }

  if (file.size > MAX_PDF_SIZE_BYTES) {
    throw new Error('File exceeds the 50MB local upload limit.')
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  return storeLocalFile(request, 'uploads', file.name, bytes)
}

export async function uploadOutlinedPdf(request: Request, fileName: string, bytes: Uint8Array) {
  if (getStorageMode() === 'blob' && process.env.BLOB_READ_WRITE_TOKEN) {
    const result = await put(createStoragePath('exports', fileName), Buffer.from(bytes), {
      access: 'public',
      contentType: 'application/pdf',
    })

    return {
      pathname: result.pathname,
      url: result.url,
    }
  }

  return storeLocalFile(request, 'exports', fileName, bytes)
}

export function isAllowedSourceUrl(request: Request, sourceUrl: string) {
  const source = new URL(sourceUrl)
  const requestBaseUrl = new URL(getConfiguredBaseUrl(request))

  if (source.origin === requestBaseUrl.origin && source.pathname.startsWith('/api/files/uploads/')) {
    return true
  }

  return source.hostname.includes('vercel-storage.com')
}

export async function readSourcePdf(request: Request, sourceUrl: string) {
  const source = new URL(sourceUrl)
  const requestBaseUrl = new URL(getConfiguredBaseUrl(request))

  if (source.origin === requestBaseUrl.origin && source.pathname.startsWith('/api/files/')) {
    const localRelativePath = source.pathname.replace(/^\/api\/files\//, '')
    const bytes = await readFile(resolveLocalPath(localRelativePath))
    return new Uint8Array(bytes)
  }

  const response = await fetch(sourceUrl)

  if (!response.ok) {
    throw new Error(`Could not download source PDF (${response.status}).`)
  }

  return new Uint8Array(await response.arrayBuffer())
}

export async function readLocalStoredFile(relativePath: string) {
  return readFile(resolveLocalPath(relativePath))
}
