import { randomUUID } from 'node:crypto'
import type { ExportJob, ExportOutlineNode, JobStatus } from '@pdf-outline-builder/shared'

interface CreateJobInput {
  fileName: string
  outline: ExportOutlineNode[]
  sourceBlobUrl: string
}

interface StoredJob extends ExportJob {
  outline: ExportOutlineNode[]
}

class InMemoryJobStore {
  private readonly jobs = new Map<string, StoredJob>()

  create(input: CreateJobInput) {
    const now = new Date().toISOString()
    const job: StoredJob = {
      createdAt: now,
      downloadUrl: null,
      error: null,
      fileName: input.fileName,
      id: `job_${randomUUID()}`,
      outline: input.outline,
      sourceBlobUrl: input.sourceBlobUrl,
      status: 'queued',
      updatedAt: now,
    }

    this.jobs.set(job.id, job)
    return this.toPublicJob(job)
  }

  get(id: string) {
    const job = this.jobs.get(id)
    return job ? this.toPublicJob(job) : null
  }

  markStatus(id: string, status: JobStatus, patch?: Partial<Pick<StoredJob, 'downloadUrl' | 'error'>>) {
    const existing = this.jobs.get(id)

    if (!existing) {
      return null
    }

    const nextJob: StoredJob = {
      ...existing,
      ...patch,
      status,
      updatedAt: new Date().toISOString(),
    }

    this.jobs.set(id, nextJob)
    return this.toPublicJob(nextJob)
  }

  private toPublicJob(job: StoredJob): ExportJob {
    return {
      createdAt: job.createdAt,
      downloadUrl: job.downloadUrl,
      error: job.error,
      fileName: job.fileName,
      id: job.id,
      sourceBlobUrl: job.sourceBlobUrl,
      status: job.status,
      updatedAt: job.updatedAt,
    }
  }
}

export const jobStore = new InMemoryJobStore()
