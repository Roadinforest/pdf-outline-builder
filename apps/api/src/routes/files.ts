import { Hono } from 'hono'
import { readLocalStoredFile } from '../services/blobStorage'

export const filesRoute = new Hono()

filesRoute.get('/*', async (c) => {
  const relativePath = c.req.path.replace(/^\/api\/files\//, '')
  const file = await readLocalStoredFile(relativePath)

  return new Response(file, {
    headers: {
      'content-type': 'application/pdf',
    },
  })
})
