import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '../db'
import { fail, ok } from '../lib/response'

export const health = new Hono()

health.get('/health', async (c) => {
  try {
    await db.execute(sql`SELECT 1`)
    return ok(c, { status: 'up', db: 'up' })
  } catch {
    return fail(c, 'INTERNAL', 'db 연결 실패', 503)
  }
})
