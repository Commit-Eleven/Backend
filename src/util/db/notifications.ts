import { and, eq } from 'drizzle-orm'
import type { NOTIFICATION_TYPE } from '../config/constants'
import type { db } from './connection'
import { notification, notificationSetting } from './schema'

type NotificationType = (typeof NOTIFICATION_TYPE)[number]

// db 든 트랜잭션이든 같은 방식으로 쓸 수 있게 실행자 타입을 뽑아 둔다
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

// 저장된 설정이 없으면 기본은 켜짐(true)
export async function isNotificationEnabled(
  tx: Executor,
  userId: number,
  type: NotificationType,
): Promise<boolean> {
  const [row] = await tx
    .select({ enabled: notificationSetting.enabled })
    .from(notificationSetting)
    .where(and(eq(notificationSetting.userId, userId), eq(notificationSetting.type, type)))
    .limit(1)
  return row?.enabled ?? true
}

// 알림 설정을 확인하고 켜져 있을 때만 만든다. 꺼져 있으면 undefined.
export async function notify(
  tx: Executor,
  params: { userId: number; type: NotificationType; payload?: Record<string, unknown> },
): Promise<number | undefined> {
  if (!(await isNotificationEnabled(tx, params.userId, params.type))) return undefined
  const [inserted] = await tx
    .insert(notification)
    .values({ userId: params.userId, type: params.type, payload: params.payload ?? {} })
    .$returningId()
  return inserted.id
}
