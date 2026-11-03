import { Hono } from 'hono'
import { groups } from '../util/db/groups'
import { users } from '../util/db/users'
import { type AuthEnv, requireAuth } from '../util/http/auth'
import { toCamelCase } from '../util/http/case'
import { Errors, ok } from '../util/http/response'

export const studyGroups = new Hono<AuthEnv>()

// 초대가 안 됐을 때 이유별 에러
const INVITE_ERRORS = {
  no_group: () => Errors.notFound('없는 그룹'),
  not_member: () => Errors.forbidden('그룹 멤버만 초대할 수 있음'),
  already_member: () => Errors.duplicate('이미 그룹 멤버'),
  already_invited: () => Errors.duplicate('이미 초대함'),
  full: () => Errors.duplicate('그룹 정원이 찼음'),
}

// 그룹 초대하기. 그룹 멤버면 누구나 초대할 수 있고, 받은 사람에게 알림이 간다
studyGroups.post('/:id{[0-9]+}/invites', requireAuth, async (c) => {
  const groupId = Number(c.req.param('id'))
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

  const result = await groups.invite(groupId, inviterId, targetId)
  if (result.status !== 'invited') throw INVITE_ERRORS[result.status]()

  return ok(c, { inviteId: result.inviteId, groupId, targetUserId: targetId, status: 'invited' })
})
