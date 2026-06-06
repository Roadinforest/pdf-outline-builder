export function getConfiguredBaseUrl(request: Request) {
  const explicitBaseUrl = process.env.APP_BASE_URL?.trim()

  if (explicitBaseUrl) {
    return explicitBaseUrl.replace(/\/$/, '')
  }

  const requestUrl = new URL(request.url)
  return requestUrl.origin
}

function isRunningOnVercel() {
  return process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV)
}

export function getStorageMode() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return 'blob'
  }

  return isRunningOnVercel() ? 'unavailable' : 'local'
}

export interface MiniMaxConfig {
  apiKey: string
  baseUrl: string
  model: string
}

export function getMiniMaxConfig(): MiniMaxConfig | null {
  const apiKey = process.env.MINIMAX_API_KEY?.trim()

  if (!apiKey) {
    return null
  }

  return {
    apiKey,
    baseUrl: process.env.MINIMAX_BASE_URL?.trim() || 'https://api.minimaxi.com/v1',
    model: process.env.MINIMAX_MODEL?.trim() || 'MiniMax-Text-01',
  }
}

