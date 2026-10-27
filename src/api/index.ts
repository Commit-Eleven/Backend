import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { env } from '../util/config/env'
import { runMigrations } from '../util/db/migrate'
import { AppError, fail } from '../util/http/response'
import { curriculum } from './curriculum'
import { health } from './health'
import { blank } from './problems/blank'
import { mcq } from './problems/mcq'
import { parsons } from './problems/parsons'
import { short } from './problems/short'
import { login } from './social/login'
import { tags } from './tags'
import { friends } from './users/friends'
import { me } from './users/me'
import { onboarding } from './users/onboarding'
import { profile } from './users/profile'

await runMigrations()

const app = new Hono()

app.use('*', logger())

app.route('/api/health', health)

app.route('/api/curriculum', curriculum)
app.route('/api/tags', tags)

app.route('/api/social/login', login)

app.route('/api/users/me', me)
app.route('/api/users/onboarding', onboarding)
app.route('/api/users/friends', friends)
// /:id 라 맨 뒤에 둔다
app.route('/api/users', profile)

app.route('/api/problems/blank', blank)
app.route('/api/problems/mcq', mcq)
app.route('/api/problems/parsons', parsons)
app.route('/api/problems/short', short)

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
