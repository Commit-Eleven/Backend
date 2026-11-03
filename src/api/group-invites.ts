import { Hono } from 'hono'
import { type GroupInvite, groups } from '../util/db/groups'
import { type AuthEnv, requireAuth } from '../util/http/auth'
import { Errors, ok } from '../util/http/response'

export const groupInvites = new Hono<AuthEnv>()

// 내가 받은 초대만 다룬다. 남의 초대는 있는지도 알려주지 않으려고 똑같이 404
async function findMyInvite(id: number, userId: number): Promise<GroupInvite> {
  const invite = await groups.findInvite(id)
  if (!invite || invite.userId !== userId) throw Errors.notFound('없는 초대')
  if (!Number.isSafeInteger(invite.groupId)) {
    await groups.deleteInvite(invite.id)
    throw Errors.notFound('없는 그룹')
  }
  return invite
}

// 그룹 초대 수락. 멤버로 넣고 초대는 지운다
groupInvites.post('/:id{[0-9]+}/accept', requireAuth, async (c) => {
  const invite = await findMyInvite(Number(c.req.param('id')), c.get('userId'))

  const result = await groups.acceptInvite(invite)
  if (result === 'no_group') throw Errors.notFound('없는 그룹')
  if (result === 'already_member') throw Errors.duplicate('이미 그룹 멤버')
  if (result === 'full') throw Errors.duplicate('그룹 정원이 찼음')

  return ok(c, { inviteId: invite.id, groupId: invite.groupId, status: 'accepted' })
})

// 그룹 초대 거절. 초대만 지운다
groupInvites.post('/:id{[0-9]+}/reject', requireAuth, async (c) => {
  const invite = await findMyInvite(Number(c.req.param('id')), c.get('userId'))

  await groups.deleteInvite(invite.id)
  return ok(c, { inviteId: invite.id, groupId: invite.groupId, status: 'rejected' })
})
