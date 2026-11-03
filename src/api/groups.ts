import { asc, eq } from 'drizzle-orm'
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
