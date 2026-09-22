import { Hono } from 'hono'
import { type AuthEnv, requireAuth } from '../lib/auth'
import { ok } from '../lib/response'
import { authService } from '../services/authService'

export const me = new Hono<AuthEnv>()

// 띄어쓰기 허용, 2~20자. 바꾸면 태그도 새로 뽑힘
me.patch('/me/nickname', requireAuth, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { nickname?: unknown }
  const result = await authService.changeNickname(c.get('userId'), body.nickname)
  return ok(c, result)
})
