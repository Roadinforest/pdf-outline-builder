import { Hono } from 'hono'
import { jobStore } from '../services/jobStore'

export const jobsRoute = new Hono()

jobsRoute.get('/:id', (c) => {
  const job = jobStore.get(c.req.param('id'))

  if (!job) {
    return c.json({ error: 'Job not found.' }, 404)
  }

  return c.json(job)
})
