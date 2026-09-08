import { and, eq, like, ne, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '../db'
import { friend, user } from '../db/schema'
import { type AuthEnv, mockAuth } from '../lib/auth'
import { fail, ok } from '../lib/response'

export const friends = new Hono<AuthEnv>()

// GET /users/search?q=
friends.get('/users/search', mockAuth, async (c) => {
  const q = c.req.query('q')?.trim()
  if (!q) return fail(c, 'INVALID_INPUT', 'q 파라미터 필요', 400)

  const items = await db
    .select({ id: user.id, nickname: user.nickname, totalExp: user.totalExp })
    .from(user)
    .where(and(like(user.nickname, `%${q}%`), ne(user.id, c.get('userId'))))
    .limit(20)

  return ok(c, { items })
})

// GET /friends
friends.get('/friends', mockAuth, async (c) => {
  const me = c.get('userId')

  const rows = await db
    .select()
    .from(friend)
    .where(or(eq(friend.requesterId, me), eq(friend.addresseeId, me)))

  const items = rows.map((r) => ({
    friendshipId: r.id,
    otherUserId: r.requesterId === me ? r.addresseeId : r.requesterId,
    status: r.status,
    direction: r.requesterId === me ? 'outgoing' : 'incoming',
  }))
  return ok(c, { items })
})

// POST /friends  { targetUserId }
friends.post('/friends', mockAuth, async (c) => {
  const me = c.get('userId')
  const body = (await c.req.json().catch(() => ({}))) as { targetUserId?: number }
  const target = Number(body.targetUserId)

  if (!target || Number.isNaN(target))
    return fail(c, 'INVALID_INPUT', 'targetUserId 필요', 400)
  if (target === me) return fail(c, 'INVALID_INPUT', '자기 자신 X', 400)

  const [targetUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, target))
  if (!targetUser) return fail(c, 'NOT_FOUND', '없는 사용자', 404)

  // 방향 무관 중복 체크 (uq는 같은 방향만 막음)
  const [dup] = await db
    .select({ id: friend.id })
    .from(friend)
    .where(
      or(
        and(eq(friend.requesterId, me), eq(friend.addresseeId, target)),
        and(eq(friend.requesterId, target), eq(friend.addresseeId, me)),
      ),
    )
  if (dup) return fail(c, 'DUPLICATE', '이미 신청했거나 친구', 409)

  const [inserted] = await db
    .insert(friend)
    .values({ requesterId: me, addresseeId: target })
    .$returningId()

  return ok(c, { friendshipId: inserted.id, status: 'pending' }, 201)
})

// POST /friends/:id/accept
friends.post('/friends/:id/accept', mockAuth, async (c) => {
  const me = c.get('userId')
  const id = Number(c.req.param('id'))

  const [f] = await db.select().from(friend).where(eq(friend.id, id))
  if (!f) return fail(c, 'NOT_FOUND', '없는 요청', 404)
  if (f.addresseeId !== me) return fail(c, 'FORBIDDEN', '내가 받은 요청 아님', 403)
  if (f.status !== 'pending') return fail(c, 'INVALID_INPUT', '이미 처리됨', 400)

  await db
    .update(friend)
    .set({ status: 'accepted', respondedAt: new Date() })
    .where(eq(friend.id, id))

  return ok(c, { friendshipId: id, status: 'accepted' })
})

// DELETE /friends/:id  - pending이면 거절, accepted면 삭제
friends.delete('/friends/:id', mockAuth, async (c) => {
  const me = c.get('userId')
  const id = Number(c.req.param('id'))

  const [f] = await db.select().from(friend).where(eq(friend.id, id))
  if (!f) return fail(c, 'NOT_FOUND', '없는 관계', 404)
  if (f.requesterId !== me && f.addresseeId !== me)
    return fail(c, 'FORBIDDEN', '내 관계 아님', 403)

  await db.delete(friend).where(eq(friend.id, id))
  return c.body(null, 204)
})
