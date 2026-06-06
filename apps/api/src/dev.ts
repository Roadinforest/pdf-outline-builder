import 'dotenv/config'
import { serve } from '@hono/node-server'
import { app } from './app.js'

const port = Number(process.env.PORT ?? 8787)

if (!process.env.MINIMAX_API_KEY?.trim()) {
  console.warn(
    '[pdf-outline-api] MINIMAX_API_KEY is not set. POST /api/outline/refine will respond with 503 until it is provided (e.g. via apps/api/.env).',
  )
}

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`pdf-outline-api listening on http://localhost:${info.port}`)
  },
)
