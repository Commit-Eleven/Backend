import { and, desc, eq, inArray, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { SEARCH_RESULT_LIMIT } from '../../util/config/constants'
import { db } from '../../util/db/connection'
import { friend } from '../../util/db/schema'
import { users } from '../../util/db/users'
import { type AuthEnv, requireAuth } from '../../util/http/auth'
import { toCamelCase } from '../../util/http/case'
import { Errors, ok } from '../../util/http/response'

type FriendStatus = 'pending' | 'accepted'
type SearchRelationship = 'none' | 'pending_outgoing' | 'pending_incoming' | 'friends'

async function listFriends(userId: number, status?: FriendStatus) {
  const relationshipFilter = or(
    eq(friend.requesterId, userId),
    eq(friend.addresseeId, userId),
  )
  const where = status
    ? and(relationshipFilter, eq(friend.status, status))
    : relationshipFilter
  const rows = await db
    .select()
    .from(friend)
    .where(where)
    .orderBy(desc(friend.createdAt), desc(friend.id))
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

async function relationshipByUserId(
  userId: number,
  userIds: number[],
): Promise<Map<number, SearchRelationship>> {
  const relationships = new Map<number, SearchRelationship>()
  if (userIds.length === 0) return relationships

  const rows = await db
    .select()
    .from(friend)
    .where(
      or(
        and(eq(friend.requesterId, userId), inArray(friend.addresseeId, userIds)),
        and(eq(friend.addresseeId, userId), inArray(friend.requesterId, userIds)),
      ),
    )

  for (const row of rows) {
    const otherId = row.requesterId === userId ? row.addresseeId : row.requesterId
    const relationship: SearchRelationship =
      row.status === 'accepted'
        ? 'friends'
        : row.requesterId === userId
          ? 'pending_outgoing'
          : 'pending_incoming'

    if (relationship === 'friends' || !relationships.has(otherId)) {
      relationships.set(otherId, relationship)
    }
  }

  return relationships
}

async function sendRequest(requesterId: number, addresseeId: number) {
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
    .where(
      and(
        eq(friend.id, friendshipId),
        eq(friend.addresseeId, userId),
        eq(friend.status, 'pending'),
      ),
    )
  return { friendshipId, status: 'accepted' as const }
}

async function removeFriendship(userId: number, friendshipId: number) {
  const [f] = await db.select().from(friend).where(eq(friend.id, friendshipId))
  if (!f) throw Errors.notFound('없는 관계')
  if (f.requesterId !== userId && f.addresseeId !== userId) {
    throw Errors.forbidden('내 관계 아님')
  }

  await db
    .delete(friend)
    .where(
      and(
        eq(friend.id, friendshipId),
        or(eq(friend.requesterId, userId), eq(friend.addresseeId, userId)),
      ),
    )
  const message = f.status === 'accepted' ? '친구 삭제됨' : '친구 요청 거절됨'
  return { friendshipId, message }
}

export const friends = new Hono<AuthEnv>()

friends.get('/search', requireAuth, async (c) => {
  const query = (c.req.query('q') ?? '').trim()
  if (!query) throw Errors.invalidInput('q 파라미터 필요')
  if (query.length > 35) throw Errors.invalidInput('검색어는 35자 이하')

  const userId = c.get('userId')
  const items = await users.search(query, userId, SEARCH_RESULT_LIMIT)
  const relationships = await relationshipByUserId(
    userId,
    items.map((item) => item.id),
  )

  return ok(c, {
    items: items.map((item) => ({
      ...item,
      relationship: relationships.get(item.id) ?? 'none',
    })),
  })
})

friends.get('/', requireAuth, async (c) => {
  const rawStatus = c.req.query('status')
  if (rawStatus !== undefined && rawStatus !== 'pending' && rawStatus !== 'accepted') {
    throw Errors.invalidInput('status는 pending 또는 accepted')
  }

  const items = await listFriends(c.get('userId'), rawStatus)
  return ok(c, { items })
})

friends.post('/', requireAuth, async (c) => {
  const body = toCamelCase((await c.req.json().catch(() => ({}))) as Record<string, unknown>) as {
    targetUserId?: unknown
  }
  if (body.targetUserId === undefined || body.targetUserId === null) {
    throw Errors.invalidInput('targetUserId 필요')
  }

  const targetUserId = parsePositiveId(body.targetUserId, 'targetUserId')
  const result = await sendRequest(c.get('userId'), targetUserId)
  return ok(c, result, 201)
})

friends.post('/:id/accept', requireAuth, async (c) => {
  const id = parsePositiveId(c.req.param('id'), 'id')
  const result = await acceptRequest(c.get('userId'), id)
  return ok(c, result)
})

friends.delete('/:id', requireAuth, async (c) => {
  const id = parsePositiveId(c.req.param('id'), 'id')
  const result = await removeFriendship(c.get('userId'), id)
  return ok(c, result)
})

function parsePositiveId(value: unknown, field: string): number {
  const input =
    typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value
  if (typeof input !== 'string' || !/^[1-9]\d*$/.test(input)) {
    throw Errors.invalidInput(`${field}는 양의 정수여야 합니다`)
  }

  const id = Number(input)
  if (!Number.isSafeInteger(id)) throw Errors.invalidInput(`${field}가 너무 큽니다`)

  return id
}
