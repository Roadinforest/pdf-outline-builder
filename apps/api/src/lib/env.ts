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
