import { and, eq, inArray } from 'drizzle-orm'
import type { NOTIFICATION_TYPE } from '../config/constants'
import { db } from './connection'
import { notification, notificationSetting } from './schema'

type NotificationType = (typeof NOTIFICATION_TYPE)[number]

// 알림 보내기. 받는 사람이 그 종류를 꺼 두었으면 건너뛴다
export async function notify(
  userIds: number[],
  type: NotificationType,
  payload: Record<string, unknown>,
): Promise<void> {
  const targets = [...new Set(userIds)]
  if (targets.length === 0) return

  const disabled = await db
    .select({ userId: notificationSetting.userId })
    .from(notificationSetting)
    .where(
      and(
        inArray(notificationSetting.userId, targets),
        eq(notificationSetting.type, type),
        eq(notificationSetting.enabled, false),
      ),
    )
  const off = new Set(disabled.map((row) => row.userId))
  const receivers = targets.filter((id) => !off.has(id))
  if (receivers.length === 0) return

  await db.insert(notification).values(receivers.map((userId) => ({ userId, type, payload })))
}
