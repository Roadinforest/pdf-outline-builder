const localApiBaseUrl = 'http://localhost:8787'
const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()

export const apiBaseUrl = configuredApiBaseUrl && configuredApiBaseUrl.length > 0
  ? configuredApiBaseUrl.replace(/\/+$/, '')
  : localApiBaseUrl

export function apiUrl(pathname: string) {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`
  return `${apiBaseUrl}${normalizedPath}`
}

export async function readJsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = `Request failed with status ${response.status}.`

    try {
      const body = await response.json() as { error?: string }

      if (body.error) {
        detail = body.error
      }
    } catch {
      // Ignore malformed error payloads.
    }

    throw new Error(detail)
  }

  return response.json() as Promise<T>
}
