import { Hono } from 'hono'
import { logger } from 'hono/logger'
import blank from './features/blank'
import { env } from './lib/env'
import { AppError } from './lib/errors'
import { fail } from './lib/response'
import { auth } from './routes/auth'
import { dbview } from './routes/dbview'
import { friends } from './routes/friends'
import { health } from './routes/health'
import { learning } from './routes/learning'
import { testpage } from './routes/testpage'

const app = new Hono()

app.use('*', logger())

app.get('/', (c) => c.redirect('/test'))
app.route('/', health)
app.route('/', auth)
app.route('/', friends)
app.route('/', learning)
app.route('/', testpage)
app.route('/', dbview)
app.route('/api/blank', blank)

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
