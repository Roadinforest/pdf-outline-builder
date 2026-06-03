import { Hono } from 'hono'
import { getStorageMode } from '../lib/env'

export const healthRoute = new Hono()

healthRoute.get('/', (c) => {
  return c.json({
    service: 'pdf-outline-api',
    status: 'ok',
    storage: getStorageMode(),
  })
})
