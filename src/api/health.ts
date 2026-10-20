import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '../util/db/connection'
import { fail, ok } from '../util/http/response'

export const health = new Hono()

health.get('/', async (c) => {
  try {
    await db.execute(sql`SELECT 1`)
    return ok(c, { status: 'Success', db: 'Online' })
  } catch {
    return fail(c, 'Internal', '데이터베이스 연결 실패', 503)
  }
})
