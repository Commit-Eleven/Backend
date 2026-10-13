import { and, eq, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { SEARCH_RESULT_LIMIT } from '../../util/config/constants'
import { db } from '../../util/db/connection'
import { friend } from '../../util/db/schema'
import { users } from '../../util/db/users'
import { type AuthEnv, requireAuth } from '../../util/http/auth'
import { toCamelCase } from '../../util/http/case'
import { Errors, fail, ok } from '../../util/http/response'

async function listFriends(userId: number) {
  const rows = await db
    .select()
    .from(friend)
    .where(or(eq(friend.requesterId, userId), eq(friend.addresseeId, userId)))
  const otherIds = rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId))
  const others = await users.findByIds(otherIds)
  const otherById = new Map(others.map((u) => [u.id, u]))

  return rows.map((r) => {
    const otherId = r.requesterId === userId ? r.addresseeId : r.requesterId
    return {
      friendshipId: r.id,
      status: r.status,
      direction: r.requesterId === userId ? ('outgoing' as const) : ('incoming' as const),

      user: otherById.get(otherId) ?? {
        id: otherId,
        nickname: '(알 수 없음)',
        tag: '0000',
        totalExp: 0,
      },
    }
  })
}

async function sendRequest(requesterId: number, addresseeId: number) {
  if (!addresseeId) throw Errors.invalidInput('targetUserId 필요')
  if (addresseeId === requesterId) throw Errors.invalidInput('자기 자신 X')

  const target = await users.findById(addresseeId)
  if (!target) throw Errors.notFound('없는 사용자')

  const [existing] = await db
    .select()
    .from(friend)
    .where(
      or(
        and(eq(friend.requesterId, requesterId), eq(friend.addresseeId, addresseeId)),
        and(eq(friend.requesterId, addresseeId), eq(friend.addresseeId, requesterId)),
      ),
    )
  if (existing) throw Errors.duplicate('이미 신청했거나 친구')

  const [inserted] = await db.insert(friend).values({ requesterId, addresseeId }).$returningId()
  const [created] = await db.select().from(friend).where(eq(friend.id, inserted.id))
  return { friendshipId: created.id, status: created.status }
}

async function acceptRequest(userId: number, friendshipId: number) {
  const [f] = await db.select().from(friend).where(eq(friend.id, friendshipId))
  if (!f) throw Errors.notFound('없는 요청')
  if (f.addresseeId !== userId) throw Errors.forbidden('내가 받은 요청 아님')
  if (f.status !== 'pending') throw Errors.invalidInput('이미 처리됨')

  await db
    .update(friend)
    .set({ status: 'accepted', respondedAt: new Date() })
    .where(eq(friend.id, friendshipId))
  return { friendshipId, status: 'accepted' as const }
}

async function removeFriendship(userId: number, friendshipId: number) {
  const [f] = await db.select().from(friend).where(eq(friend.id, friendshipId))
  if (!f) throw Errors.notFound('없는 관계')
  if (f.requesterId !== userId && f.addresseeId !== userId) {
    throw Errors.forbidden('내 관계 아님')
  }

  await db.delete(friend).where(eq(friend.id, friendshipId))
  const message = f.status === 'accepted' ? '친구 삭제됨' : '친구 요청 거절됨'
  return { friendshipId, message }
}

export const friends = new Hono<AuthEnv>()

friends.get('/search', requireAuth, async (c) => {
  const query = (c.req.query('q') ?? '').trim()
  if (!query) throw Errors.invalidInput('q 파라미터 필요')
  const items = await users.search(query, c.get('userId'), SEARCH_RESULT_LIMIT)
  return ok(c, { items })
})

friends.get('/', requireAuth, async (c) => {
  const items = await listFriends(c.get('userId'))
  return ok(c, { items })
})

friends.post('/', requireAuth, async (c) => {
  const body = toCamelCase((await c.req.json().catch(() => ({}))) as Record<string, unknown>) as {
    targetUserId?: number
  }
  const result = await sendRequest(c.get('userId'), Number(body.targetUserId))
  return ok(c, result, 201)
})

friends.post('/:id/accept', requireAuth, async (c) => {
  const id = Number(c.req.param('id'))
  if (Number.isNaN(id)) return fail(c, 'INVALID_INPUT', '잘못된 id', 400)
  const result = await acceptRequest(c.get('userId'), id)
  return ok(c, result)
})

// pending=거절, accepted=삭제
friends.delete('/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'))
  if (Number.isNaN(id)) return fail(c, 'INVALID_INPUT', '잘못된 id', 400)
  const result = await removeFriendship(c.get('userId'), id)
  return ok(c, result)
})
