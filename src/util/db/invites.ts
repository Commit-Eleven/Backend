import { and, count, eq } from 'drizzle-orm'
import { db } from './connection'
import { groupMember, notification, studyGroup } from './schema'

// 그룹 초대는 따로 테이블 없이 notification(type=group_invite) 한 줄로 저장한다.
// payload 에 groupId, inviterId 가 들어 있고, 초대 id 는 그 알림 id 다
export type GroupInvite = {
  id: number
  userId: number
  groupId: number
  inviterId: number | null
}

export type AcceptResult = 'joined' | 'no_group' | 'already_member' | 'full'

export const invites = {
  async findInvite(id: number): Promise<GroupInvite | undefined> {
    const [row] = await db
      .select()
      .from(notification)
      .where(and(eq(notification.id, id), eq(notification.type, 'group_invite')))
    if (!row) return undefined

    const payload = (row.payload ?? {}) as { groupId?: unknown; inviterId?: unknown }
    const inviterId = Number(payload.inviterId)
    return {
      id: row.id,
      userId: row.userId,
      groupId: Number(payload.groupId),
      inviterId: Number.isSafeInteger(inviterId) ? inviterId : null,
    }
  },

  async deleteInvite(id: number): Promise<void> {
    await db.delete(notification).where(eq(notification.id, id))
  },

  // 그룹 행을 잠가서 여러 명이 동시에 수락해도 정원을 넘지 않게 한다
  async acceptInvite(invite: GroupInvite): Promise<AcceptResult> {
    return db.transaction(async (tx) => {
      const [group] = await tx
        .select()
        .from(studyGroup)
        .where(eq(studyGroup.id, invite.groupId))
        .for('update')
      // 그룹이 없어졌거나 이미 들어가 있으면 초대는 의미가 없으니 지운다
      if (!group) {
        await tx.delete(notification).where(eq(notification.id, invite.id))
        return 'no_group'
      }

      const [member] = await tx
        .select()
        .from(groupMember)
        .where(and(eq(groupMember.groupId, group.id), eq(groupMember.userId, invite.userId)))
      if (member) {
        await tx.delete(notification).where(eq(notification.id, invite.id))
        return 'already_member'
      }

      // 정원이 찬 경우는 자리가 날 수도 있으니 초대를 남겨 둔다
      const [{ n }] = await tx
        .select({ n: count() })
        .from(groupMember)
        .where(eq(groupMember.groupId, group.id))
      if (n >= group.capacity) return 'full'

      await tx.insert(groupMember).values({ groupId: group.id, userId: invite.userId })
      await tx.delete(notification).where(eq(notification.id, invite.id))
      return 'joined'
    })
  },
}
