import { upload } from '@vercel/blob/client'
import { apiUrl } from './api'

type StorageMode = 'blob' | 'local' | 'unavailable'

const missingBlobConfigurationMessage = 'Uploads are unavailable because the API is deployed without Vercel Blob configured. Add BLOB_READ_WRITE_TOKEN to the API project and redeploy.'

let storageModePromise: Promise<StorageMode> | null = null

function createUploadPathname(fileName: string) {
  const now = new Date()
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  const prefix = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  return `uploads/${prefix}/${safeName || 'document.pdf'}`
}

async function getStorageMode() {
  if (!storageModePromise) {
    storageModePromise = fetch(apiUrl('/api/health'))
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Health check failed with status ${response.status}.`)
        }

        const body = await response.json() as { storage?: StorageMode }

        if (body.storage === 'blob' || body.storage === 'local') {
          return body.storage
        }

        return 'unavailable'
      })
      .catch(() => 'unavailable')
  }

  return storageModePromise
}

async function uploadSourcePdfLocally(file: File) {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(apiUrl('/api/blob/upload/local'), {
    body: formData,
    method: 'POST',
  })

  if (!response.ok) {
    const fallbackError = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(fallbackError?.error ?? 'Local upload failed.')
  }

  const body = await response.json() as { pathname: string; url: string }

  return {
    mode: 'local' as const,
    pathname: body.pathname,
    url: body.url,
  }
}

export async function uploadSourcePdf(file: File) {
  const pathname = createUploadPathname(file.name)
  const storageMode = await getStorageMode()

  if (storageMode === 'local') {
    return uploadSourcePdfLocally(file)
  }

  if (storageMode === 'unavailable') {
    throw new Error(missingBlobConfigurationMessage)
  }

  try {
    const result = await upload(pathname, file, {
      access: 'public',
      handleUploadUrl: apiUrl('/api/blob/upload'),
    })

    return {
      mode: 'blob' as const,
      url: result.url,
    }
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Blob client upload failed.')
  }
}
