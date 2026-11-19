import { and, count, desc, eq, inArray, ne, or } from 'drizzle-orm'
import { Hono } from 'hono'
import {
  DOCUMENT_PAGE_SIZE,
  DOCUMENT_PAGE_SIZE_MAX,
  REPORT_STATUS,
  REVIEW_COMMENT_MAX,
  REVIEW_DECISION,
} from '../util/config/constants'
import { db } from '../util/db/connection'
import {
  documents,
  type GroupRole,
  isManager,
  loadReadable,
  memberRole,
  toSummaries,
} from '../util/db/documents'
import { notify } from '../util/db/notify'
import {
  document,
  documentReview,
  groupIntegration,
  groupMember,
  studyGroup,
  user,
} from '../util/db/schema'
import { DISCORD_COLOR, sendDiscord } from '../util/discord'
import { type AuthEnv, requireAuth } from '../util/http/auth'
import { readJsonBody } from '../util/http/body'
import { toCamelCase } from '../util/http/case'
import { parseEnum, parseId, parseQueryInt } from '../util/http/params'
import { Errors, ok } from '../util/http/response'

const ID = '/:id{[1-9][0-9]*}'
const MANAGER_ROLES = ['owner', 'manager'] as const

export const documentReports = new Hono<AuthEnv>()

// 내 보고서 현황. 관리자면 검토 대기 수도 같이 준다
documentReports.get('/summary', requireAuth, async (c) => {
  const userId = c.get('userId')
  const groupId = parseId(c.req.query('group_id'), 'group_id')
  const role = await memberRole(groupId, userId)
  if (role === null) throw Errors.forbidden('그룹 멤버만 볼 수 있습니다')

  const rows = await db
    .select({ status: document.status, n: count() })
    .from(document)
    .where(
      and(
        eq(document.groupId, groupId),
        eq(document.kind, 'report'),
        eq(document.authorId, userId),
      ),
    )
    .groupBy(document.status)
  const mine = Object.fromEntries(REPORT_STATUS.map((s) => [s, 0])) as Record<
    (typeof REPORT_STATUS)[number],
    number
  >
  for (const row of rows) if (row.status) mine[row.status] = row.n

  let pendingReview: number | null = null
  if (isManager(role)) {
    const [row] = await db
      .select({ n: count() })
      .from(document)
      .where(reviewQueueCondition([{ groupId, role }], userId))
    pendingReview = row.n
  }
  return ok(c, { groupId, myRole: role, myReports: mine, pendingReview })
})

// 내가 검토할 보고서. 관리자인 모든 그룹을 모아서 보여준다
documentReports.get('/reviews', requireAuth, async (c) => {
  const userId = c.get('userId')
  const page = parseQueryInt(c.req.query('page'), 1, 'page')
  const limit = parseQueryInt(
    c.req.query('limit'),
    DOCUMENT_PAGE_SIZE,
    'limit',
    DOCUMENT_PAGE_SIZE_MAX,
  )
  const offset = (page - 1) * limit
  if (!Number.isSafeInteger(offset)) throw Errors.invalidInput('page가 너무 큽니다')

  const rawGroupId = c.req.query('group_id')
  const onlyGroup = rawGroupId === undefined ? undefined : parseId(rawGroupId, 'group_id')

  const managed = await db
    .select({ groupId: groupMember.groupId, role: groupMember.role })
    .from(groupMember)
    .where(and(eq(groupMember.userId, userId), inArray(groupMember.role, [...MANAGER_ROLES])))
  const targets = managed.filter((m) => onlyGroup === undefined || m.groupId === onlyGroup)
  if (onlyGroup !== undefined && targets.length === 0) {
    throw Errors.forbidden('관리자만 검토 목록을 볼 수 있습니다')
  }
  if (targets.length === 0) return ok(c, { documents: [], page, limit, total: 0 })

  const where = reviewQueueCondition(targets, userId)
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(document)
      .where(where)
      .orderBy(desc(document.updatedAt), desc(document.id))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(document).where(where),
  ])
  return ok(c, { documents: await toSummaries(rows, userId), page, limit, total: total.value })
})

// 방장인 그룹은 전부, 관리자인 그룹은 남이 쓴 것만 대기열에 넣는다
function reviewQueueCondition(targets: { groupId: number; role: GroupRole }[], userId: number) {
  const ownerGroups = targets.filter((t) => t.role === 'owner').map((t) => t.groupId)
  const managerGroups = targets.filter((t) => t.role === 'manager').map((t) => t.groupId)
  const scope = or(
    ownerGroups.length ? inArray(document.groupId, ownerGroups) : undefined,
    managerGroups.length
      ? and(inArray(document.groupId, managerGroups), ne(document.authorId, userId))
      : undefined,
  )
  return and(eq(document.kind, 'report'), eq(document.status, 'pending'), scope)
}

// 검토 받으려고 제출. 그룹의 방장과 관리자에게 알림이 간다
documentReports.post(`${ID}/submit`, requireAuth, async (c) => {
  const userId = c.get('userId')
  const id = parseId(c.req.param('id'), 'id')
  const doc = await documents.submit(id, userId)

  const managers = await db
    .select({ userId: groupMember.userId })
    .from(groupMember)
    .where(
      and(
        eq(groupMember.groupId, doc.groupId ?? 0),
        inArray(groupMember.role, [...MANAGER_ROLES]),
        ne(groupMember.userId, userId),
      ),
    )
  await notify(
    managers.map((m) => m.userId),
    'document_submitted',
    { documentId: doc.id, groupId: doc.groupId, title: doc.title, authorId: userId },
  )
  return ok(c, { id: doc.id, status: doc.status })
})

documentReports.post(`${ID}/withdraw`, requireAuth, async (c) => {
  const doc = await documents.withdraw(parseId(c.req.param('id'), 'id'), c.get('userId'))
  return ok(c, { id: doc.id, status: doc.status })
})

// 승인이나 반려. 반려할 때는 이유가 꼭 있어야 한다
documentReports.post(`${ID}/review`, requireAuth, async (c) => {
  const userId = c.get('userId')
  const id = parseId(c.req.param('id'), 'id')
  const body = toCamelCase(await readJsonBody(c)) as { decision?: unknown; comment?: unknown }

  const decision = parseEnum(body.decision, REVIEW_DECISION, 'decision')
  if (!decision) throw Errors.invalidInput('decision 필요')
  let comment: string | null = null
  if (body.comment !== undefined && body.comment !== null) {
    if (typeof body.comment !== 'string') throw Errors.invalidInput('comment는 문자열')
    comment = body.comment.trim() || null
    if (comment && Array.from(comment).length > REVIEW_COMMENT_MAX) {
      throw Errors.invalidInput(`comment는 ${REVIEW_COMMENT_MAX}자 이하`)
    }
  }
  if (decision === 'rejected' && !comment)
    throw Errors.invalidInput('반려 이유(comment)가 필요합니다')

  const doc = await documents.review(id, userId, decision, comment)

  await notify([doc.authorId], 'document_reviewed', {
    documentId: doc.id,
    groupId: doc.groupId,
    title: doc.title,
    decision,
    comment,
    reviewerId: userId,
  })
  if (decision === 'approved') void announceApproval(doc.id, userId, comment)
  return ok(c, { id: doc.id, status: doc.status })
})

// 승인된 보고서를 디스코드 채널에 올린다. 실패해도 승인은 그대로 둔다
async function announceApproval(documentId: number, reviewerId: number, comment: string | null) {
  const [row] = await db
    .select({
      title: document.title,
      body: document.body,
      groupId: document.groupId,
      authorNickname: user.nickname,
      authorTag: user.tag,
    })
    .from(document)
    .innerJoin(user, eq(user.id, document.authorId))
    .where(eq(document.id, documentId))
  if (!row?.groupId) return

  const [integration] = await db
    .select({ url: groupIntegration.discordWebhookUrl })
    .from(groupIntegration)
    .where(eq(groupIntegration.groupId, row.groupId))
  if (!integration?.url) return

  const [group] = await db
    .select({ name: studyGroup.name })
    .from(studyGroup)
    .where(eq(studyGroup.id, row.groupId))
  const [reviewer] = await db
    .select({ nickname: user.nickname, tag: user.tag })
    .from(user)
    .where(eq(user.id, reviewerId))

  const fields = [
    { name: '작성자', value: `${row.authorNickname}#${row.authorTag}`, inline: true },
    {
      name: '승인자',
      value: reviewer ? `${reviewer.nickname}#${reviewer.tag}` : '-',
      inline: true,
    },
    { name: '그룹', value: group?.name ?? '-', inline: true },
  ]
  if (comment) fields.push({ name: '승인 의견', value: comment, inline: false })

  await sendDiscord(integration.url, {
    title: `[승인된 보고서] ${row.title}`,
    description: row.body,
    color: DISCORD_COLOR.green,
    fields,
  })
}

// 검토 이력
documentReports.get(`${ID}/reviews`, requireAuth, async (c) => {
  const { doc } = await loadReadable(parseId(c.req.param('id'), 'id'), c.get('userId'))
  const rows = await db
    .select({
      id: documentReview.id,
      decision: documentReview.decision,
      comment: documentReview.comment,
      createdAt: documentReview.createdAt,
      reviewerId: documentReview.reviewerId,
      nickname: user.nickname,
      tag: user.tag,
    })
    .from(documentReview)
    .innerJoin(user, eq(user.id, documentReview.reviewerId))
    .where(eq(documentReview.documentId, doc.id))
    .orderBy(desc(documentReview.id))
  return ok(c, {
    reviews: rows.map((r) => ({
      id: r.id,
      decision: r.decision,
      comment: r.comment,
      reviewer: { id: r.reviewerId, nickname: r.nickname, tag: r.tag },
      createdAt: r.createdAt,
    })),
  })
})
