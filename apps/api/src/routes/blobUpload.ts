import { Hono } from 'hono'
import { createBlobClientUploadResponse, createLocalUpload } from '../services/blobStorage'

export const blobUploadRoute = new Hono()

blobUploadRoute.post('/upload', async (c) => {
  try {
    const body = await c.req.json()
    const response = await createBlobClientUploadResponse(c.req.raw, body)
    return c.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Blob upload token generation failed.'
    const status = message.includes('BLOB_READ_WRITE_TOKEN') ? 503 : 400
    return c.json({ error: message }, status)
  }
})

blobUploadRoute.post('/upload/local', async (c) => {
  const body = await c.req.parseBody()
  const file = body.file

  if (!(file instanceof File)) {
    return c.json({ error: 'Missing PDF file.' }, 400)
  }

  const result = await createLocalUpload(c.req.raw, file)
  return c.json(result)
})
