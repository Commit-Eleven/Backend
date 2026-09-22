import { Hono } from 'hono'
import { type AuthEnv, requireAuth } from '../lib/auth'
import { toCamelCase } from '../lib/caseConvert'
import { fail, ok } from '../lib/response'
import { friendService } from '../services/friendService'

export const friends = new Hono<AuthEnv>()

friends.get('/users/search', requireAuth, async (c) => {
  const items = await friendService.searchUsers(c.req.query('q') ?? '', c.get('userId'))
  return ok(c, { items })
})

friends.get('/friends', requireAuth, async (c) => {
  const items = await friendService.listFriends(c.get('userId'))
  return ok(c, { items })
})

friends.post('/friends', requireAuth, async (c) => {
  const body = toCamelCase((await c.req.json().catch(() => ({}))) as Record<string, unknown>) as {
    targetUserId?: number
  }
  const result = await friendService.sendRequest(c.get('userId'), Number(body.targetUserId))
  return ok(c, result, 201)
})

friends.post('/friends/:id/accept', requireAuth, async (c) => {
  const id = Number(c.req.param('id'))
  if (Number.isNaN(id)) return fail(c, 'INVALID_INPUT', '잘못된 id', 400)
  const result = await friendService.acceptRequest(c.get('userId'), id)
  return ok(c, result)
})

// pending=거절, accepted=삭제
friends.delete('/friends/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'))
  if (Number.isNaN(id)) return fail(c, 'INVALID_INPUT', '잘못된 id', 400)
  const result = await friendService.removeFriendship(c.get('userId'), id)
  return ok(c, result)
})
