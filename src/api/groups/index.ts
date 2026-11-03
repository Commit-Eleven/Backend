import { and, asc, desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '../../util/db/connection'
import { groupMember, studyGroup, user } from '../../util/db/schema'
import { type AuthEnv, requireAuth } from '../../util/http/auth'
import { Errors, ok } from '../../util/http/response'

export const groups = new Hono<AuthEnv>()

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
