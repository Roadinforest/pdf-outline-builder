export function getConfiguredBaseUrl(request: Request) {
  const explicitBaseUrl = process.env.APP_BASE_URL?.trim()

  if (explicitBaseUrl) {
    return explicitBaseUrl.replace(/\/$/, '')
  }

  const requestUrl = new URL(request.url)
  return requestUrl.origin
}

export function getStorageMode() {
  return process.env.BLOB_READ_WRITE_TOKEN ? 'blob' : 'local'
}
