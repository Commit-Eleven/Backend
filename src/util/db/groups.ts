import { and, count, eq, sql } from 'drizzle-orm'
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

export type InviteResult =
  | { status: 'invited'; inviteId: number }
  | { status: 'no_group' | 'not_member' | 'already_member' | 'already_invited' | 'full' }

export const groups = {
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

  // 그룹 초대하기. 초대받은 사람에게 group_invite 알림을 하나 만든다(이게 곧 초대).
  // 그룹 행을 잠가서 같은 사람에게 동시에 두 번 초대가 가지 않게 한다
  async invite(groupId: number, inviterId: number, targetId: number): Promise<InviteResult> {
    return db.transaction(async (tx) => {
      const [group] = await tx
        .select()
        .from(studyGroup)
        .where(eq(studyGroup.id, groupId))
        .for('update')
      if (!group) return { status: 'no_group' }

      const members = await tx
        .select({ userId: groupMember.userId })
        .from(groupMember)
        .where(eq(groupMember.groupId, groupId))
      if (!members.some((m) => m.userId === inviterId)) return { status: 'not_member' }
      if (members.some((m) => m.userId === targetId)) return { status: 'already_member' }
      if (members.length >= group.capacity) return { status: 'full' }

      const [pending] = await tx
        .select({ id: notification.id })
        .from(notification)
        .where(
          and(
            eq(notification.userId, targetId),
            eq(notification.type, 'group_invite'),
            sql`json_extract(${notification.payload}, '$.groupId') = ${groupId}`,
          ),
        )
        .limit(1)
      if (pending) return { status: 'already_invited' }

      const [inserted] = await tx
        .insert(notification)
        .values({ userId: targetId, type: 'group_invite', payload: { groupId, inviterId } })
        .$returningId()
      return { status: 'invited', inviteId: inserted.id }
    })
  },
}
