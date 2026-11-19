import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '../util/db/connection'
import { memberRole } from '../util/db/documents'
import { groupIntegration, groupMember } from '../util/db/schema'
import { DISCORD_COLOR, isDiscordWebhook, sendDiscord } from '../util/discord'
import { type AuthEnv, requireAuth } from '../util/http/auth'
import { readJsonBody } from '../util/http/body'
import { toCamelCase } from '../util/http/case'
import { parseId } from '../util/http/params'
import { Errors, ok } from '../util/http/response'

const ID = '/:id{[1-9][0-9]*}'

export const groupSettings = new Hono<AuthEnv>()

async function requireOwner(groupId: number, userId: number) {
  const role = await memberRole(groupId, userId)
  if (role === null) throw Errors.notFound('없는 그룹')
  if (role !== 'owner') throw Errors.forbidden('방장만 할 수 있습니다')
}

// 멤버를 관리자(manager)로 올리거나 다시 멤버로 내린다. 관리자는 보고서를 검토할 수 있다
groupSettings.patch(`${ID}/members/:userId{[1-9][0-9]*}`, requireAuth, async (c) => {
  const groupId = parseId(c.req.param('id'), 'id')
  const targetId = parseId(c.req.param('userId'), 'user_id')
  await requireOwner(groupId, c.get('userId'))

  const body = toCamelCase(await readJsonBody(c)) as { role?: unknown }
  if (body.role !== 'manager' && body.role !== 'member') {
    throw Errors.invalidInput('role은 manager 또는 member')
  }

  const target = and(eq(groupMember.groupId, groupId), eq(groupMember.userId, targetId))
  const [member] = await db.select({ role: groupMember.role }).from(groupMember).where(target)
  if (!member) throw Errors.notFound('그룹 멤버가 아닙니다')
  if (member.role === 'owner') throw Errors.invalidInput('방장의 역할은 바꿀 수 없습니다')

  await db.update(groupMember).set({ role: body.role }).where(target)
  return ok(c, { groupId, userId: targetId, role: body.role })
})

groupSettings.get(`${ID}/integrations/discord`, requireAuth, async (c) => {
  const groupId = parseId(c.req.param('id'), 'id')
  await requireOwner(groupId, c.get('userId'))
  const [row] = await db
    .select({ url: groupIntegration.discordWebhookUrl })
    .from(groupIntegration)
    .where(eq(groupIntegration.groupId, groupId))
  return ok(c, { connected: Boolean(row?.url), webhookUrl: row?.url ? mask(row.url) : null })
})

// 승인된 보고서를 올릴 디스코드 웹훅을 등록한다. 주소는 방장만 볼 수 있고 응답에도 가려서 준다
groupSettings.put(`${ID}/integrations/discord`, requireAuth, async (c) => {
  const groupId = parseId(c.req.param('id'), 'id')
  await requireOwner(groupId, c.get('userId'))

  const body = toCamelCase(await readJsonBody(c)) as { webhookUrl?: unknown }
  if (typeof body.webhookUrl !== 'string' || !isDiscordWebhook(body.webhookUrl.trim())) {
    throw Errors.invalidInput('디스코드 웹훅 주소가 아닙니다')
  }
  const url = body.webhookUrl.trim()
  await db
    .insert(groupIntegration)
    .values({ groupId, discordWebhookUrl: url })
    .onDuplicateKeyUpdate({ set: { discordWebhookUrl: url } })
  return ok(c, { connected: true, webhookUrl: mask(url) })
})

groupSettings.delete(`${ID}/integrations/discord`, requireAuth, async (c) => {
  const groupId = parseId(c.req.param('id'), 'id')
  await requireOwner(groupId, c.get('userId'))
  await db.delete(groupIntegration).where(eq(groupIntegration.groupId, groupId))
  return ok(c, { connected: false })
})

groupSettings.post(`${ID}/integrations/discord/test`, requireAuth, async (c) => {
  const groupId = parseId(c.req.param('id'), 'id')
  await requireOwner(groupId, c.get('userId'))
  const [row] = await db
    .select({ url: groupIntegration.discordWebhookUrl })
    .from(groupIntegration)
    .where(eq(groupIntegration.groupId, groupId))
  if (!row?.url) throw Errors.notFound('등록된 웹훅이 없습니다')

  const sent = await sendDiscord(row.url, {
    title: '연동 테스트',
    description: '승인된 보고서가 이 채널에 올라옵니다.',
    color: DISCORD_COLOR.blue,
  })
  return ok(c, { sent })
})

function mask(url: string): string {
  return url.replace(/\/[\w-]+$/, '/****')
}
