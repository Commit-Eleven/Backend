import { and, count, desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { NOTIFICATION_TYPE } from '../util/config/constants'
import { db } from '../util/db/connection'
import { notification, notificationSetting } from '../util/db/schema'
import { users } from '../util/db/users'
import { type AuthEnv, requireAuth } from '../util/http/auth'
import { toCamelCase } from '../util/http/case'
import { Errors, ok } from '../util/http/response'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

type NotificationType = (typeof NOTIFICATION_TYPE)[number]

export const notifications = new Hono<AuthEnv>()

// 시스템 알림 생성. 스팸과 이벤트 위조를 막기 위해 관리자만 보낼 수 있다.
notifications.post('/', requireAuth, async (c) => {
  const sender = await users.findById(c.get('userId'))
  if (!sender) throw Errors.notFound('없는 사용자')
  if (sender.tier !== 'admin') throw Errors.forbidden('관리자만 시스템 알림을 보낼 수 있습니다')

  const body = toCamelCase((await c.req.json().catch(() => ({}))) as Record<string, unknown>) as {
    userId?: unknown
    title?: unknown
    message?: unknown
  }
  const userId = parsePositiveId(body.userId, 'user_id')
  if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 100) {
    throw Errors.invalidInput('title은 1~100자 문자열이어야 합니다')
  }
  if (
    typeof body.message !== 'string' ||
    !body.message.trim() ||
    body.message.trim().length > 1000
  ) {
    throw Errors.invalidInput('message는 1~1000자 문자열이어야 합니다')
  }
  if (!(await users.findById(userId))) throw Errors.notFound('알림 대상 사용자가 없습니다')

  const [inserted] = await db
    .insert(notification)
    .values({
      userId,
      type: 'system',
      payload: { title: body.title.trim(), message: body.message.trim() },
    })
    .$returningId()
  const [created] = await db
    .select({
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      payload: notification.payload,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
    })
    .from(notification)
    .where(eq(notification.id, inserted.id))

  return ok(c, created, 201)
})

// 로그인한 사용자의 알림 이력. unread_only=true로 안 읽은 알림만 조회할 수 있다.
notifications.get('/', requireAuth, async (c) => {
  const userId = c.get('userId')
  const page = parsePositiveQuery(c.req.query('page'), 1, 'page')
  const limit = parsePositiveQuery(c.req.query('limit'), DEFAULT_LIMIT, 'limit')
  if (limit > MAX_LIMIT) throw Errors.invalidInput(`limit은 ${MAX_LIMIT} 이하`)

  const rawUnreadOnly = c.req.query('unread_only')
  if (rawUnreadOnly !== undefined && rawUnreadOnly !== 'true' && rawUnreadOnly !== 'false') {
    throw Errors.invalidInput('unread_only는 true 또는 false')
  }
  const unreadOnly = rawUnreadOnly === 'true'
  const offset = (page - 1) * limit
  if (!Number.isSafeInteger(offset)) throw Errors.invalidInput('page가 너무 큽니다')

  const where = unreadOnly
    ? and(eq(notification.userId, userId), eq(notification.isRead, false))
    : eq(notification.userId, userId)
  const [totalRow] = await db.select({ value: count() }).from(notification).where(where)
  const items = await db
    .select({
      id: notification.id,
      type: notification.type,
      payload: notification.payload,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
    })
    .from(notification)
    .where(where)
    .orderBy(desc(notification.createdAt), desc(notification.id))
    .limit(limit)
    .offset(offset)

  return ok(c, {
    items,
    pagination: { page, limit, total: totalRow.value },
    unreadCount: await countUnread(userId),
  })
})

// 안 읽은 알림 개수. 사이드바 배지처럼 목록 없이 숫자만 필요할 때
notifications.get('/unread-count', requireAuth, async (c) => {
  return ok(c, { unreadCount: await countUnread(c.get('userId')) })
})

// 알림 설정 변경. body에 포함된 종류만 변경한다.
notifications.patch('/settings', requireAuth, async (c) => {
  const body = toCamelCase((await c.req.json().catch(() => ({}))) as Record<string, unknown>) as {
    settings?: unknown
  }
  if (!Array.isArray(body.settings) || body.settings.length === 0) {
    throw Errors.invalidInput('settings 배열이 필요합니다')
  }

  const parsed: { type: NotificationType; enabled: boolean }[] = []
  const seen = new Set<string>()
  for (const item of body.settings) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw Errors.invalidInput('각 settings 항목은 type과 enabled가 필요합니다')
    }
    const entry = item as Record<string, unknown>
    if (
      typeof entry.type !== 'string' ||
      !NOTIFICATION_TYPE.includes(entry.type as NotificationType) ||
      typeof entry.enabled !== 'boolean'
    ) {
      throw Errors.invalidInput('알림 type 또는 enabled 값이 잘못되었습니다')
    }
    if (seen.has(entry.type)) throw Errors.invalidInput('중복된 알림 type이 있습니다')
    seen.add(entry.type)
    parsed.push({ type: entry.type as NotificationType, enabled: entry.enabled })
  }

  const userId = c.get('userId')
  await db.transaction(async (tx) => {
    for (const setting of parsed) {
      await tx
        .insert(notificationSetting)
        .values({ userId, type: setting.type, enabled: setting.enabled })
        .onDuplicateKeyUpdate({ set: { enabled: setting.enabled } })
    }
  })

  return ok(c, { settings: parsed })
})

// 저장되지 않은 종류는 기본적으로 사용 설정(true)으로 본다.
notifications.get('/settings', requireAuth, async (c) => {
  const rows = await db
    .select({ type: notificationSetting.type, enabled: notificationSetting.enabled })
    .from(notificationSetting)
    .where(eq(notificationSetting.userId, c.get('userId')))
  const enabledByType = new Map(rows.map((row) => [row.type, row.enabled]))

  return ok(c, {
    settings: NOTIFICATION_TYPE.map((type) => ({
      type,
      enabled: enabledByType.get(type) ?? true,
    })),
  })
})

// 알림 읽음 처리. 내 알림만 바꿀 수 있고, is_read 에 true/false 를 보낸다
notifications.patch('/:id', requireAuth, async (c) => {
  const id = parsePositiveId(c.req.param('id'), 'id')
  const body = toCamelCase((await c.req.json().catch(() => ({}))) as Record<string, unknown>) as {
    isRead?: unknown
  }
  if (typeof body.isRead !== 'boolean') throw Errors.invalidInput('is_read 는 true 또는 false')

  const mine = and(eq(notification.id, id), eq(notification.userId, c.get('userId')))
  const [found] = await db.select({ id: notification.id }).from(notification).where(mine)
  if (!found) throw Errors.notFound('없는 알림')

  await db.update(notification).set({ isRead: body.isRead }).where(mine)
  return ok(c, { id, isRead: body.isRead })
})

async function countUnread(userId: number): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(notification)
    .where(and(eq(notification.userId, userId), eq(notification.isRead, false)))
  return row.value
}

function parsePositiveQuery(raw: string | undefined, fallback: number, field: string): number {
  if (raw === undefined) return fallback
  if (!/^[1-9]\d*$/.test(raw)) throw Errors.invalidInput(`${field}는 양의 정수여야 합니다`)
  const value = Number(raw)
  if (!Number.isSafeInteger(value)) throw Errors.invalidInput(`${field}가 너무 큽니다`)
  return value
}

function parsePositiveId(value: unknown, field: string): number {
  const parsed =
    typeof value === 'number' && Number.isSafeInteger(value)
      ? value
      : typeof value === 'string' && /^[1-9]\d*$/.test(value)
        ? Number(value)
        : NaN
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw Errors.invalidInput(`${field}는 양의 정수여야 합니다`)
  }
  return parsed
}
