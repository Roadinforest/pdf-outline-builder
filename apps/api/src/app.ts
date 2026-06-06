import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { blobUploadRoute } from './routes/blobUpload.js'
import { filesRoute } from './routes/files.js'
import { healthRoute } from './routes/health.js'
import { jobsRoute } from './routes/jobs.js'
import { outlineRoute } from './routes/outlineExport.js'

const localhostOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i
const vercelOriginPattern = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i
const configuredCorsOrigins = new Set(
  (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
)

function isAllowedCorsOrigin(origin: string) {
  if (configuredCorsOrigins.has(origin)) {
    return true
  }

  return localhostOriginPattern.test(origin) || vercelOriginPattern.test(origin)
}

export const app = new Hono()

app.use('/api/*', cors({
  origin: (origin) => {
    if (!origin) {
      return '*'
    }

    return isAllowedCorsOrigin(origin) ? origin : ''
  },
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
}))

app.get('/', (c) => {
  return c.json({
    service: 'pdf-outline-api',
    status: 'ok',
  })
})

app.route('/api/health', healthRoute)
app.route('/api/blob', blobUploadRoute)
app.route('/api/outline', outlineRoute)
app.route('/api/jobs', jobsRoute)
app.route('/api/files', filesRoute)

app.onError((error, c) => {
  console.error(error)
  return c.json({ error: error.message || 'Internal Server Error' }, 500)
})

export default app
