import { Hono } from 'hono'
import { users } from '../../util/db/users'
import { type AuthEnv, requireAuth } from '../../util/http/auth'
import { Errors, ok } from '../../util/http/response'

export const userProfile = new Hono<AuthEnv>()

// 다른 사용자 공개 프로필 조회
userProfile.get('/:id', requireAuth, async (c) => {
  const rawId = c.req.param('id')
  if (!/^[1-9]\d*$/.test(rawId)) throw Errors.invalidInput('id는 양의 정수여야 합니다')

  const id = Number(rawId)
  if (!Number.isSafeInteger(id)) throw Errors.invalidInput('잘못된 id')

  const profile = await users.findPublicProfileById(id)
  if (!profile) throw Errors.notFound('없는 사용자')

  return ok(c, { user: profile })
})
