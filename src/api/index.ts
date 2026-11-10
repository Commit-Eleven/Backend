import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { env } from '../util/config/env'
import { runMigrations } from '../util/db/migrate'
import { AppError, fail } from '../util/http/response'
import { curriculum } from './curriculum'
import { groupInvites } from './group-invites'
import { groups, myGroups } from './groups'
import { health } from './health'
import { lessonsApi } from './lessons'
import { notifications } from './notifications'
import { blank } from './problems/blank'
import { code } from './problems/code'
import { mcq } from './problems/mcq'
import { parsons } from './problems/parsons'
import { short } from './problems/short'
import { ranking } from './ranking'
import { login } from './social/login'
import { tags } from './tags'
import { units } from './units'
import { friends } from './users/friends'
import { me } from './users/me'
import { onboarding } from './users/onboarding'
import { userProfile } from './users/profile'

await runMigrations()

const app = new Hono()

app.use('*', logger())

app.route('/api/health', health)

app.route('/api/curriculum', curriculum)
app.route('/api/units', units)
app.route('/api/lessons', lessonsApi)
app.route('/api/ranking', ranking)
app.route('/api/tags', tags)

app.route('/api/social/login', login)

app.route('/api/users/me', me)
app.route('/api/me', myGroups)
app.route('/api/users/onboarding', onboarding)
app.route('/api/users/friends', friends)
app.route('/api/users', userProfile)

app.route('/api/groups', groups)
app.route('/api/group-invites', groupInvites)
app.route('/api/notifications', notifications)

app.route('/api/problems/blank', blank)
app.route('/api/problems/mcq', mcq)
app.route('/api/problems/parsons', parsons)
app.route('/api/problems/short', short)
app.route('/api/problems/code', code)

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
