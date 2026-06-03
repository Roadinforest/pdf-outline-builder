import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { blobUploadRoute } from './routes/blobUpload.js'
import { filesRoute } from './routes/files.js'
import { healthRoute } from './routes/health.js'
import { jobsRoute } from './routes/jobs.js'
import { outlineExportRoute } from './routes/outlineExport.js'

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

export default app
