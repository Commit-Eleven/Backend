import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { logger } from 'hono/logger'
import mcq from './features/problems/mcq'
import { env } from './lib/env'
import { AppError } from './lib/errors'
import { fail } from './lib/response'
import { loadProblems } from './problems'
import { dbview } from './routes/dbview'
import { friends } from './routes/friends'
import { health } from './routes/health'
import { learning } from './routes/learning'

loadProblems()

const app = new OpenAPIHono()

app.use('*', logger())

app.route('/', health)
app.route('/', friends)
app.route('/', learning)
app.route('/', dbview)
app.route('/api/problems/mcq', mcq)

app.doc('/doc', { openapi: '3.0.0', info: { title: 'Codegram API', version: '0.1.0' } })
app.get('/swagger', swaggerUI({ url: '/doc' }))

app.notFound((c) => fail(c, 'NOT_FOUND', '없는 경로', 404))

app.onError((err, c) => {
  if (err instanceof AppError) return fail(c, err.code, err.message, err.status)
  console.error(err)
  return fail(c, 'INTERNAL', '서버 오류', 500)
})

export default {
  port: env.port,
  fetch: app.fetch,
}
