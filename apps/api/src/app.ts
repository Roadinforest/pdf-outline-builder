import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { blobUploadRoute } from './routes/blobUpload'
import { filesRoute } from './routes/files'
import { healthRoute } from './routes/health'
import { jobsRoute } from './routes/jobs'
import { outlineExportRoute } from './routes/outlineExport'

export const app = new Hono()

app.use('/api/*', cors())

app.get('/', (c) => {
  return c.json({
    service: 'pdf-outline-api',
    status: 'ok',
  })
})

app.route('/api/health', healthRoute)
app.route('/api/blob', blobUploadRoute)
app.route('/api/outline', outlineExportRoute)
app.route('/api/jobs', jobsRoute)
app.route('/api/files', filesRoute)

app.onError((error, c) => {
  console.error(error)
  return c.json({ error: error.message || 'Internal Server Error' }, 500)
})
