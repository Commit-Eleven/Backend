import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { logger } from 'hono/logger'
import { MAX_BODY_BYTES } from '../util/config/constants'
import { env } from '../util/config/env'
import { runMigrations } from '../util/db/migrate'
import { AppError, fail } from '../util/http/response'
import { curriculum } from './curriculum'
import { documentComments } from './document-comments'
import { documentReports } from './document-reports'
import { documentsApi } from './documents'
import { groupInvites } from './group-invites'
import { groupSettings } from './group-settings'
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
import { AVATAR_REQUEST_MAX_BYTES, avatar, avatars } from './users/avatar'
import { friends } from './users/friends'
import { me } from './users/me'
import { onboarding } from './users/onboarding'
import { userProfile } from './users/profile'

await runMigrations()

if (env.devTokenEnabled) {
  console.warn('[auth] 개발용 토큰 엔드포인트가 열려 있습니다: /api/social/login/dev-token')
}

const app = new Hono()

app.use('*', logger())

// 프로필 사진 업로드만 multipart 본문을 받으므로 한도를 따로 둔다
const jsonBodyLimit = bodyLimit({
  maxSize: MAX_BODY_BYTES,
  onError: (c) => fail(c, 'PAYLOAD_TOO_LARGE', '요청 본문이 너무 큽니다', 413),
})
const avatarBodyLimit = bodyLimit({
  maxSize: AVATAR_REQUEST_MAX_BYTES,
  onError: (c) => fail(c, 'PAYLOAD_TOO_LARGE', '프로필 사진은 2MB 이하여야 합니다', 413),
})
const AVATAR_PATHS = new Set(['/api/users/me/avatar', '/api/me/avatar'])
const isAvatarPath = (path: string) => AVATAR_PATHS.has(path.replace(/\/+$/, ''))
app.use('/api/*', (c, next) =>
  (isAvatarPath(c.req.path) ? avatarBodyLimit : jsonBodyLimit)(c, next),
)

app.route('/api/health', health)

app.route('/api/curriculum', curriculum)
app.route('/api/units', units)
app.route('/api/lessons', lessonsApi)
app.route('/api/ranking', ranking)
app.route('/api/tags', tags)

app.route('/api/social/login', login)

app.route('/api/users/me/avatar', avatar)
app.route('/api/users/me', me)
// 프론트가 /api/me/avatar 로 부르고 있어서 같은 기능을 여기에도 붙인다
app.route('/api/me/avatar', avatar)
app.route('/api/me', myGroups)
app.route('/api/avatars', avatars)
app.route('/api/users/onboarding', onboarding)
app.route('/api/users/friends', friends)
app.route('/api/users', userProfile)

app.route('/api/groups', groups)
app.route('/api/groups', groupSettings)
app.route('/api/group-invites', groupInvites)
app.route('/api/documents', documentReports)
app.route('/api/documents', documentComments)
app.route('/api/documents', documentsApi)
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
  // 본문을 메모리에 통째로 올리기 전에 서버 차원에서도 한 번 더 막는다
  maxRequestBodySize: AVATAR_REQUEST_MAX_BYTES,
}
