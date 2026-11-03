import { and, asc, count, desc, eq, inArray, like } from 'drizzle-orm'
import { Hono } from 'hono'
import {
  DEFAULT_GROUP_CAPACITY,
  GROUP_CAPACITY_MAX,
  GROUP_CAPACITY_MIN,
} from '../util/config/constants'
import { db } from '../util/db/connection'
import { invites } from '../util/db/invites'
import { groupMember, studyGroup, user } from '../util/db/schema'
import { users } from '../util/db/users'
import { type AuthEnv, requireAuth } from '../util/http/auth'
import { toCamelCase } from '../util/http/case'
import { Errors, ok } from '../util/http/response'

const NAME_MAX = 50
const DESCRIPTION_MAX = 255

async function createGroup(
  ownerId: number,
  name: string,
  description: string | null,
  capacity: number,
) {
  // 그룹이랑 방장 멤버 행은 같이 들어가야 해서 트랜잭션
  const groupId = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(studyGroup)
      .values({ name, description, ownerId, capacity })
      .$returningId()
    await tx.insert(groupMember).values({ groupId: inserted.id, userId: ownerId, role: 'owner' })
    return inserted.id
  })

  return findGroupDetail(groupId)
}

async function findGroupDetail(groupId: number) {
  const [group] = await db.select().from(studyGroup).where(eq(studyGroup.id, groupId))
  if (!group) return undefined

  // 방장 먼저, 나머지는 들어온 순서
  const members = await db
    .select({
      id: user.id,
      nickname: user.nickname,
      tag: user.tag,
      totalExp: user.totalExp,
      role: groupMember.role,
      joinedAt: groupMember.joinedAt,
    })
    .from(groupMember)
    .innerJoin(user, eq(user.id, groupMember.userId))
    .where(eq(groupMember.groupId, groupId))
    .orderBy(asc(groupMember.role), asc(groupMember.joinedAt))

  return {
    group: { ...group, memberCount: members.length },
    members,
  }
}

export const groups = new Hono<AuthEnv>()

export const myGroups = new Hono<AuthEnv>()

myGroups.get('/groups', requireAuth, async (c) => {
  const userId = c.get('userId')
  const memberships = await db
    .select({
      id: studyGroup.id,
      name: studyGroup.name,
      description: studyGroup.description,
      ownerId: studyGroup.ownerId,
      capacity: studyGroup.capacity,
      createdAt: studyGroup.createdAt,
      role: groupMember.role,
      joinedAt: groupMember.joinedAt,
    })
    .from(groupMember)
    .innerJoin(studyGroup, eq(studyGroup.id, groupMember.groupId))
    .where(eq(groupMember.userId, userId))
    .orderBy(asc(groupMember.joinedAt))

  const items = await Promise.all(
    memberships.map(async (group) => {
      const [members] = await db
        .select({ value: count() })
        .from(groupMember)
        .where(eq(groupMember.groupId, group.id))
      return { ...group, memberCount: members.value }
    }),
  )

  return ok(c, { items })
})

// 참여할 수 있는 그룹 탐색. 목록에서 받은 id를 /join에 전달한다.
groups.get('', requireAuth, async (c) => {
  const query = (c.req.query('q') ?? '').trim()
  if (query.length > 50) throw Errors.invalidInput('q는 50자 이하')

  const page = parsePositiveQuery(c.req.query('page'), 1, 'page')
  const limit = parsePositiveQuery(c.req.query('limit'), 20, 'limit')
  if (limit > 50) throw Errors.invalidInput('limit은 50 이하')
  const offset = (page - 1) * limit
  if (!Number.isSafeInteger(offset)) throw Errors.invalidInput('page가 너무 큽니다')

  const where = query ? like(studyGroup.name, `%${query}%`) : undefined
  const [totalRow] = await db.select({ value: count() }).from(studyGroup).where(where)
  const rows = await db
    .select({
      id: studyGroup.id,
      name: studyGroup.name,
      description: studyGroup.description,
      ownerId: studyGroup.ownerId,
      capacity: studyGroup.capacity,
      createdAt: studyGroup.createdAt,
    })
    .from(studyGroup)
    .where(where)
    .orderBy(desc(studyGroup.id))
    .limit(limit)
    .offset(offset)

  const ids = rows.map((group) => group.id)
  const memberCounts = ids.length
    ? await db
        .select({ groupId: groupMember.groupId, value: count() })
        .from(groupMember)
        .where(inArray(groupMember.groupId, ids))
        .groupBy(groupMember.groupId)
    : []
  const memberCountByGroupId = new Map(memberCounts.map((item) => [item.groupId, item.value]))

  return ok(c, {
    items: rows.map((group) => {
      const memberCount = memberCountByGroupId.get(group.id) ?? 0
      return {
        ...group,
        memberCount,
        isFull: memberCount >= group.capacity,
      }
    }),
    pagination: { page, limit, total: totalRow.value },
  })
})

// 그룹 참여. 이미 참여한 경우와 정원이 찬 경우는 충돌로 응답함.
groups.post('/join', requireAuth, async (c) => {
  const body = toCamelCase((await c.req.json().catch(() => ({}))) as Record<string, unknown>) as {
    groupId?: unknown
  }
  const rawId = body.groupId
  const groupId =
    typeof rawId === 'number' && Number.isSafeInteger(rawId)
      ? rawId
      : typeof rawId === 'string' && /^[1-9]\d*$/.test(rawId)
        ? Number(rawId)
        : NaN
  if (!Number.isSafeInteger(groupId) || groupId <= 0) {
    throw Errors.invalidInput('groupId는 양의 정수여야 합니다')
  }

  const userId = c.get('userId')
  if (!(await users.findById(userId))) throw Errors.notFound('없는 사용자')

  await db.transaction(async (tx) => {
    // 같은 그룹에 대한 동시 참여 요청도 정원 검사를 순차 처리
    const [group] = await tx
      .select()
      .from(studyGroup)
      .where(eq(studyGroup.id, groupId))
      .for('update')
    if (!group) throw Errors.notFound('없는 그룹')

    const [existing] = await tx
      .select({ userId: groupMember.userId })
      .from(groupMember)
      .where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, userId)))
    if (existing) throw Errors.duplicate('이미 참여한 그룹')

    const [memberCount] = await tx
      .select({ value: count() })
      .from(groupMember)
      .where(eq(groupMember.groupId, groupId))
    if (memberCount.value >= group.capacity) throw Errors.duplicate('그룹 정원이 가득 참')

    await tx.insert(groupMember).values({ groupId, userId, role: 'member' })
  })
  return ok(c, { groupId, userId, role: 'member' }, 201)
})

// 방장이 기존 멤버에게 방장 권한을 위임함
groups.post('/:id/owner', requireAuth, async (c) => {
  const rawGroupId = c.req.param('id')
  if (!/^[1-9]\d*$/.test(rawGroupId)) {
    throw Errors.invalidInput('id는 양의 정수여야 합니다')
  }
  const groupId = Number(rawGroupId)
  if (!Number.isSafeInteger(groupId)) throw Errors.invalidInput('잘못된 id')

  const body = toCamelCase((await c.req.json().catch(() => ({}))) as Record<string, unknown>) as {
    targetUserId?: unknown
  }
  const rawTargetId = body.targetUserId
  const targetUserId =
    typeof rawTargetId === 'number' && Number.isSafeInteger(rawTargetId)
      ? rawTargetId
      : typeof rawTargetId === 'string' && /^[1-9]\d*$/.test(rawTargetId)
        ? Number(rawTargetId)
        : NaN
  if (!Number.isSafeInteger(targetUserId) || targetUserId <= 0) {
    throw Errors.invalidInput('targetUserId는 양의 정수여야 합니다')
  }

  const currentUserId = c.get('userId')
  if (targetUserId === currentUserId) throw Errors.duplicate('이미 방장입니다')

  await db.transaction(async (tx) => {
    const [group] = await tx
      .select()
      .from(studyGroup)
      .where(eq(studyGroup.id, groupId))
      .for('update')
    if (!group) throw Errors.notFound('없는 그룹')
    if (group.ownerId !== currentUserId) throw Errors.forbidden('방장만 위임할 수 있습니다')

    const [targetMembership] = await tx
      .select({ userId: groupMember.userId })
      .from(groupMember)
      .where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, targetUserId)))
    if (!targetMembership) throw Errors.invalidInput('위임 대상은 그룹 멤버여야 합니다')

    await tx
      .update(groupMember)
      .set({ role: 'member' })
      .where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, currentUserId)))
    await tx
      .update(groupMember)
      .set({ role: 'owner' })
      .where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, targetUserId)))
    await tx.update(studyGroup).set({ ownerId: targetUserId }).where(eq(studyGroup.id, groupId))
  })

  return ok(c, { groupId, ownerId: targetUserId })
})

// 그룹 생성. 만든 사람이 방장으로 바로 들어감
groups.post('', requireAuth, async (c) => {
  const body = toCamelCase((await c.req.json().catch(() => ({}))) as Record<string, unknown>) as {
    name?: unknown
    description?: unknown
    capacity?: unknown
  }

  if (typeof body.name !== 'string' || !body.name.trim()) throw Errors.invalidInput('name 필요')
  const name = body.name.trim()
  if (name.length > NAME_MAX) throw Errors.invalidInput(`name은 ${NAME_MAX}자 이하`)

  if (body.description != null && typeof body.description !== 'string') {
    throw Errors.invalidInput('description은 문자열')
  }
  const description = typeof body.description === 'string' ? body.description.trim() || null : null
  if (description && description.length > DESCRIPTION_MAX) {
    throw Errors.invalidInput(`description은 ${DESCRIPTION_MAX}자 이하`)
  }

  const capacity = body.capacity ?? DEFAULT_GROUP_CAPACITY
  if (
    typeof capacity !== 'number' ||
    !Number.isInteger(capacity) ||
    capacity < GROUP_CAPACITY_MIN ||
    capacity > GROUP_CAPACITY_MAX
  ) {
    throw Errors.invalidInput(`capacity는 ${GROUP_CAPACITY_MIN}~${GROUP_CAPACITY_MAX} 사이 정수`)
  }

  const result = await createGroup(c.get('userId'), name, description, capacity)
  if (!result) throw Errors.internal('그룹 생성 실패')
  return ok(c, result, 201)
})

// 그룹 상세. 멤버만 볼 수 있음
groups.get('/:id', requireAuth, async (c) => {
  const rawId = c.req.param('id')
  if (!/^[1-9]\d*$/.test(rawId)) throw Errors.invalidInput('id는 양의 정수여야 합니다')

  const id = Number(rawId)
  if (!Number.isSafeInteger(id)) throw Errors.invalidInput('잘못된 id')

  const result = await findGroupDetail(id)
  if (!result) throw Errors.notFound('없는 그룹')

  const me = result.members.find((m) => m.id === c.get('userId'))
  if (!me) throw Errors.forbidden('그룹 멤버 아님')

  return ok(c, { ...result, myRole: me.role })
})

// 팀 미리보기. 팀 찾기에서 참여하기 전에 보는 용도라 멤버가 아니어도 볼 수 있다
groups.get('/:id/preview', requireAuth, async (c) => {
  const rawId = c.req.param('id')
  if (!/^[1-9]\d*$/.test(rawId)) throw Errors.invalidInput('id는 양의 정수여야 합니다')

  const id = Number(rawId)
  if (!Number.isSafeInteger(id)) throw Errors.invalidInput('잘못된 id')

  const result = await findGroupDetail(id)
  if (!result) throw Errors.notFound('없는 그룹')

  const { group, members } = result
  const owner = members.find((m) => m.role === 'owner')
  const me = members.find((m) => m.id === c.get('userId'))

  // 상세와 달리 경험치·참여 시각은 빼고 닉네임·태그·역할만 보여준다
  return ok(c, {
    group: {
      id: group.id,
      name: group.name,
      description: group.description,
      capacity: group.capacity,
      memberCount: group.memberCount,
      isFull: group.memberCount >= group.capacity,
      createdAt: group.createdAt,
    },
    owner: owner ? { id: owner.id, nickname: owner.nickname, tag: owner.tag } : null,
    members: members.map((m) => ({ id: m.id, nickname: m.nickname, tag: m.tag, role: m.role })),
    isMember: me !== undefined,
    myRole: me?.role ?? null,
  })
})

// 팀 수정. 방장만 할 수 있다. name, description, capacity 중 보낸 것만 바꾼다
groups.patch('/:id', requireAuth, async (c) => {
  const rawId = c.req.param('id')
  if (!/^[1-9]\d*$/.test(rawId)) throw Errors.invalidInput('id는 양의 정수여야 합니다')

  const id = Number(rawId)
  if (!Number.isSafeInteger(id)) throw Errors.invalidInput('잘못된 id')

  const body = toCamelCase((await c.req.json().catch(() => ({}))) as Record<string, unknown>) as {
    name?: unknown
    description?: unknown
    capacity?: unknown
  }
  if (body.name === undefined && body.description === undefined && body.capacity === undefined) {
    throw Errors.invalidInput('name, description, capacity 중 하나는 보내야 함')
  }

  // 검사 규칙은 그룹 생성과 같다
  const changes: { name?: string; description?: string | null; capacity?: number } = {}
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) throw Errors.invalidInput('name 필요')
    changes.name = body.name.trim()
    if (changes.name.length > NAME_MAX) throw Errors.invalidInput(`name은 ${NAME_MAX}자 이하`)
  }
  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== 'string') {
      throw Errors.invalidInput('description은 문자열')
    }
    // 빈 문자열이나 null 을 보내면 설명을 지운다
    changes.description =
      typeof body.description === 'string' ? body.description.trim() || null : null
    if (changes.description && changes.description.length > DESCRIPTION_MAX) {
      throw Errors.invalidInput(`description은 ${DESCRIPTION_MAX}자 이하`)
    }
  }
  if (body.capacity !== undefined) {
    const capacity = body.capacity
    if (
      typeof capacity !== 'number' ||
      !Number.isInteger(capacity) ||
      capacity < GROUP_CAPACITY_MIN ||
      capacity > GROUP_CAPACITY_MAX
    ) {
      throw Errors.invalidInput(`capacity는 ${GROUP_CAPACITY_MIN}~${GROUP_CAPACITY_MAX} 사이 정수`)
    }
    changes.capacity = capacity
  }

  const userId = c.get('userId')
  // 그룹 행을 잠가서 수정하는 동안 누가 참여해 정원이 바뀌지 않게 한다
  await db.transaction(async (tx) => {
    const [group] = await tx.select().from(studyGroup).where(eq(studyGroup.id, id)).for('update')
    if (!group) throw Errors.notFound('없는 그룹')
    if (group.ownerId !== userId) throw Errors.forbidden('방장만 팀을 수정할 수 있습니다')

    if (changes.capacity !== undefined) {
      const [members] = await tx
        .select({ value: count() })
        .from(groupMember)
        .where(eq(groupMember.groupId, id))
      if (changes.capacity < members.value) {
        throw Errors.duplicate(`지금 팀원 수(${members.value}명)보다 정원을 줄일 수 없습니다`)
      }
    }

    await tx.update(studyGroup).set(changes).where(eq(studyGroup.id, id))
  })

  const result = await findGroupDetail(id)
  if (!result) throw Errors.notFound('없는 그룹')
  return ok(c, { ...result, myRole: 'owner' })
})

function parsePositiveQuery(raw: string | undefined, fallback: number, field: string): number {
  if (raw === undefined) return fallback
  if (!/^[1-9]\d*$/.test(raw)) throw Errors.invalidInput(`${field}는 양의 정수여야 합니다`)
  const value = Number(raw)
  if (!Number.isSafeInteger(value)) throw Errors.invalidInput(`${field}가 너무 큽니다`)
  return value
}

// 초대가 안 됐을 때 이유별 에러
const INVITE_ERRORS = {
  no_group: () => Errors.notFound('없는 그룹'),
  not_member: () => Errors.forbidden('그룹 멤버만 초대할 수 있음'),
  already_member: () => Errors.duplicate('이미 그룹 멤버'),
  already_invited: () => Errors.duplicate('이미 초대함'),
  full: () => Errors.duplicate('그룹 정원이 찼음'),
}

// 그룹 초대하기. 그룹 멤버면 누구나 초대할 수 있고, 받은 사람에게 group_invite 알림이 간다
groups.post('/:id/invites', requireAuth, async (c) => {
  const rawId = c.req.param('id')
  if (!/^[1-9]\d*$/.test(rawId)) throw Errors.invalidInput('id는 양의 정수여야 합니다')

  const groupId = Number(rawId)
  if (!Number.isSafeInteger(groupId)) throw Errors.invalidInput('잘못된 id')

  const inviterId = c.get('userId')
  const body = toCamelCase((await c.req.json().catch(() => ({}))) as Record<string, unknown>) as {
    targetUserId?: unknown
  }

  const targetId = Number(body.targetUserId)
  if (!Number.isSafeInteger(targetId) || targetId <= 0) {
    throw Errors.invalidInput('target_user_id 가 필요함')
  }
  if (targetId === inviterId) throw Errors.invalidInput('자기 자신은 초대할 수 없음')
  if (!(await users.findById(targetId))) throw Errors.notFound('없는 사용자')

  const result = await invites.invite(groupId, inviterId, targetId)
  if (result.status !== 'invited') throw INVITE_ERRORS[result.status]()

  return ok(c, { inviteId: result.inviteId, groupId, targetUserId: targetId, status: 'invited' })
})

function parseGroupId(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw Errors.invalidInput('id는 양의 정수여야 합니다')
  const id = Number(value)
  if (!Number.isSafeInteger(id)) throw Errors.invalidInput('id가 너무 큽니다')
  return id
}

// 그룹 멤버 경험치 랭킹. 멤버만 조회 가능
groups.get('/:id/ranking', requireAuth, async (c) => {
  const groupId = parseGroupId(c.req.param('id'))
  const userId = c.get('userId')

  const [group] = await db.select().from(studyGroup).where(eq(studyGroup.id, groupId))
  if (!group) throw Errors.notFound('없는 그룹')

  const [membership] = await db
    .select({ userId: groupMember.userId })
    .from(groupMember)
    .where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, userId)))
  if (!membership) throw Errors.forbidden('그룹 멤버만 조회할 수 있습니다')

  const rows = await db
    .select({
      userId: user.id,
      nickname: user.nickname,
      tag: user.tag,
      totalExp: user.totalExp,
    })
    .from(groupMember)
    .innerJoin(user, eq(groupMember.userId, user.id))
    .where(eq(groupMember.groupId, groupId))
    // 경험치 같은 경우 먼저 가입한 멤버가 위
    .orderBy(desc(user.totalExp), asc(groupMember.joinedAt))

  const items = rows.map((row, index) => ({
    rank: index + 1,
    user: { id: row.userId, nickname: row.nickname, tag: row.tag, totalExp: row.totalExp },
  }))

  return ok(c, {
    group: { id: group.id, name: group.name, capacity: group.capacity },
    myRank: items.find((item) => item.user.id === userId)?.rank ?? null,
    items,
  })
})

// 그룹 삭제. 소유자만 가능, 멤버 기록은 cascade 로 함께 삭제
groups.delete('/:id', requireAuth, async (c) => {
  const groupId = parseGroupId(c.req.param('id'))
  const userId = c.get('userId')

  const [group] = await db.select().from(studyGroup).where(eq(studyGroup.id, groupId))
  if (!group) throw Errors.notFound('없는 그룹')
  if (group.ownerId !== userId) throw Errors.forbidden('그룹 소유자만 삭제할 수 있습니다')

  await db.delete(studyGroup).where(eq(studyGroup.id, groupId))
  return ok(c, { groupId, message: '그룹이 삭제되었습니다' })
})
