import { Hono } from 'hono'
import { friendships } from '../../util/db/friends'
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

  const user = await users.findPublicProfileById(id)
  if (!user) throw Errors.notFound('없는 사용자')

  // 내 프로필은 항상 볼 수 있고, 남의 프로필은 공개 범위를 따른다
  const viewerId = c.get('userId')
  if (viewerId !== id) {
    const visibility = await users.findProfileVisibility(id)
    if (visibility === 'private') throw Errors.forbidden('비공개 프로필입니다')
    if (visibility === 'friends' && !(await friendships.areFriends(viewerId, id))) {
      throw Errors.forbidden('친구에게만 공개된 프로필입니다')
    }
  }

  return ok(c, { user })
})
