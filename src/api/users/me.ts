import { Hono } from 'hono'
import { users } from '../../util/db/users'
import { type AuthEnv, requireAuth } from '../../util/http/auth'
import { Errors, ok } from '../../util/http/response'
import { withFreeTag } from '../../util/sign'

export const me = new Hono<AuthEnv>()

me.patch('/nickname', requireAuth, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { nickname?: unknown }
  const userId = c.get('userId')
  const input = body.nickname
  const nickname = typeof input === 'string' ? input.trim().replace(/\s+/g, ' ') : ''
  if (nickname.length < 2 || nickname.length > 20) throw Errors.invalidInput('닉네임은 2~20자')
  if (!(await users.findById(userId))) throw Errors.notFound('없는 사용자')
  const result = await withFreeTag(async (tag) => {
    await users.updateNickname(userId, nickname, tag)
    return { nickname, tag }
  })
  return ok(c, result)
})
