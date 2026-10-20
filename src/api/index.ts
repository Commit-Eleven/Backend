import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { logger } from 'hono/logger'
import { env } from '../util/config/env'
import { AppError, fail } from '../util/http/response'
import { health } from './health'
import { learning } from './problems/learning'
import mcq from './problems/mcq'
import { login } from './social/login'
import { friends } from './users/friends'
import { me } from './users/me'

const app = new OpenAPIHono()

app.use('*', logger())

app.route('/api/health', health)

app.route('/api/social/login', login)

app.route('/api/users/me', me)
app.route('/api/users/friends', friends)

app.route('/api/problems/learning', learning)
app.route('/api/problems/mcq', mcq)

app.doc('/docs', { openapi: '3.0.0', info: { title: 'Codegram API', version: '0.0.1' } })
app.get('/swagger', swaggerUI({ url: '/docs' }))

app.notFound((c) => fail(c, 'NotFound', '존재하지 않는 경로', 404))

app.onError((err, c) => {
  if (err instanceof AppError) return fail(c, err.code, err.message, err.status)
  console.error(err)
  return fail(c, 'Internal', '내부 서버 오류', 500)
})

export default {
  port: env.port,
  fetch: app.fetch,
}
