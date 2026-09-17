import { Hono } from 'hono'
import { logger } from 'hono/logger'
import blank from './features/blank'
import { fail } from './lib/response'
import { dbview } from './routes/dbview'
import { friends } from './routes/friends'
import { health } from './routes/health'
import { testpage } from './routes/testpage'

const app = new Hono()

app.use('*', logger())

app.get('/', (c) => c.redirect('/test'))
app.route('/', health)
app.route('/', friends)
app.route('/', testpage)
app.route('/', dbview)
app.route('/api/blank', blank)

app.notFound((c) => fail(c, 'NOT_FOUND', '없는 경로', 404))

app.onError((err, c) => {
  console.error(err)
  return fail(c, 'INTERNAL', '서버 오류', 500)
})

export default {
  port: Number(Bun.env.PORT ?? 3000),
  fetch: app.fetch,
}
