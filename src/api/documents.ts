import { and, count, desc, eq, inArray, isNull, like, or, type SQL } from 'drizzle-orm'
import { Hono } from 'hono'
import {
  BOOKMARK_MAX,
  DOCUMENT_BODY_MAX,
  DOCUMENT_KIND,
  DOCUMENT_LIMIT_PER_USER,
  DOCUMENT_PAGE_SIZE,
  DOCUMENT_PAGE_SIZE_MAX,
  DOCUMENT_TITLE_MAX,
  REPORT_STATUS,
} from '../util/config/constants'
import { db } from '../util/db/connection'
import {
  canDelete,
  canRead,
  type DocumentRow,
  documents,
  findDocument,
  isManager,
  loadReadable,
  memberRole,
  myRoles,
  permissionsOf,
  toSummaries,
} from '../util/db/documents'
import { document, documentBookmark, documentRevision, user } from '../util/db/schema'
import { type AuthEnv, requireAuth } from '../util/http/auth'
import { readJsonBody } from '../util/http/body'
import { toCamelCase } from '../util/http/case'
import { parseEnum, parseId, parseQueryBool, parseQueryInt } from '../util/http/params'
import { Errors, ok } from '../util/http/response'
import { truncate } from '../util/text'

type Template = {
  id: string
  name: string
  kind: (typeof DOCUMENT_KIND)[number]
  title: string
  body: string
}

const templates = (await Bun.file('static/documents/templates.json').json()) as Template[]

const ID = '/:id{[1-9][0-9]*}'

export const documentsApi = new Hono<AuthEnv>()

function readTitle(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw Errors.invalidInput('title 필요')
  const title = value.trim()
  if (Array.from(title).length > DOCUMENT_TITLE_MAX) {
    throw Errors.invalidInput(`title은 ${DOCUMENT_TITLE_MAX}자 이하`)
  }
  return title
}

function readBody(value: unknown): string {
  if (typeof value !== 'string') throw Errors.invalidInput('body는 문자열')
  if (Array.from(value).length > DOCUMENT_BODY_MAX) {
    throw Errors.invalidInput(`body는 ${DOCUMENT_BODY_MAX}자 이하`)
  }
  return value
}

// LIKE 검색에서 %, _ 가 와일드카드로 먹히지 않게 한다
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`
}

documentsApi.get('/templates', requireAuth, (c) => {
  const kind = parseEnum(c.req.query('kind'), DOCUMENT_KIND, 'kind')
  return ok(c, { templates: templates.filter((t) => !kind || t.kind === kind) })
})

// 문서 목록. group_id 가 없으면 내 개인 문서, 있으면 그 팀에서 내가 볼 수 있는 문서
documentsApi.get('/', requireAuth, async (c) => {
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

  const kind = parseEnum(c.req.query('kind'), DOCUMENT_KIND, 'kind')
  const status = parseEnum(c.req.query('status'), REPORT_STATUS, 'status')
  const mine = parseQueryBool(c.req.query('mine'), 'mine')
  const bookmarked = parseQueryBool(c.req.query('bookmarked'), 'bookmarked')
  const rawQ = c.req.query('q')?.trim()
  if (rawQ && Array.from(rawQ).length > 50) throw Errors.invalidInput('q는 50자 이하')
  const rawGroupId = c.req.query('group_id')
  const groupId = rawGroupId === undefined ? undefined : parseId(rawGroupId, 'group_id')

  if (bookmarked) return ok(c, await listBookmarked(userId, { page, limit, kind, status, q: rawQ }))

  const conditions: SQL[] = []
  if (groupId === undefined) {
    conditions.push(isNull(document.groupId), eq(document.authorId, userId))
  } else {
    const role = await memberRole(groupId, userId)
    if (role === null) throw Errors.forbidden('그룹 멤버만 볼 수 있습니다')
    conditions.push(eq(document.groupId, groupId))
    if (!isManager(role)) {
      const visible = or(
        eq(document.kind, 'wiki'),
        eq(document.authorId, userId),
        eq(document.status, 'approved'),
      )
      if (visible) conditions.push(visible)
    }
    if (mine) conditions.push(eq(document.authorId, userId))
  }
  if (kind) conditions.push(eq(document.kind, kind))
  if (status) conditions.push(eq(document.status, status))
  if (rawQ) {
    const text = or(like(document.title, likePattern(rawQ)), like(document.body, likePattern(rawQ)))
    if (text) conditions.push(text)
  }

  const where = and(...conditions)
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(document)
      .where(where)
      .orderBy(desc(document.pinned), desc(document.updatedAt), desc(document.id))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(document).where(where),
  ])
  return ok(c, { documents: await toSummaries(rows, userId), page, limit, total: total.value })
})

// 북마크한 문서. 지금도 볼 수 있는 것만 보여준다
async function listBookmarked(
  userId: number,
  opts: {
    page: number
    limit: number
    kind?: DocumentRow['kind']
    status?: DocumentRow['status']
    q?: string
  },
) {
  const marks = await db
    .select({ documentId: documentBookmark.documentId })
    .from(documentBookmark)
    .where(eq(documentBookmark.userId, userId))
    .orderBy(desc(documentBookmark.createdAt))
  const ids = marks.map((m) => m.documentId)
  const rows = ids.length ? await db.select().from(document).where(inArray(document.id, ids)) : []

  const roles = await myRoles(userId)
  const q = opts.q?.toLowerCase()
  const order = new Map(ids.map((id, i) => [id, i]))
  const visible = rows
    .filter((d) => canRead(d, userId, d.groupId === null ? null : (roles.get(d.groupId) ?? null)))
    .filter((d) => !opts.kind || d.kind === opts.kind)
    .filter((d) => !opts.status || d.status === opts.status)
    .filter((d) => !q || d.title.toLowerCase().includes(q) || d.body.toLowerCase().includes(q))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))

  const start = (opts.page - 1) * opts.limit
  const slice = visible.slice(start, start + opts.limit)
  return {
    documents: await toSummaries(slice, userId),
    page: opts.page,
    limit: opts.limit,
    total: visible.length,
  }
}

documentsApi.post('/', requireAuth, async (c) => {
  const userId = c.get('userId')
  const body = toCamelCase(await readJsonBody(c)) as {
    title?: unknown
    body?: unknown
    kind?: unknown
    groupId?: unknown
    template?: unknown
  }

  let template: Template | undefined
  if (body.template !== undefined) {
    template = templates.find((t) => t.id === body.template)
    if (!template) throw Errors.invalidInput('없는 템플릿')
  }

  const groupId =
    body.groupId === undefined || body.groupId === null ? null : parseId(body.groupId, 'group_id')
  const kind =
    parseEnum(body.kind, DOCUMENT_KIND, 'kind') ??
    template?.kind ??
    (groupId === null ? 'note' : undefined)
  if (!kind) throw Errors.invalidInput('팀 문서는 kind(wiki, report)가 필요합니다')
  if (template && template.kind !== kind) throw Errors.invalidInput('템플릿 종류와 kind가 다릅니다')

  if (groupId === null && kind !== 'note') {
    throw Errors.invalidInput('위키와 보고서는 group_id가 필요합니다')
  }
  if (groupId !== null && kind === 'note') {
    throw Errors.invalidInput('개인 노트에는 group_id를 보낼 수 없습니다')
  }
  if (groupId !== null && (await memberRole(groupId, userId)) === null) {
    throw Errors.forbidden('그룹 멤버만 만들 수 있습니다')
  }

  const title = readTitle(body.title ?? template?.title)
  const text = readBody(body.body ?? template?.body ?? '')

  const owned = await db.$count(document, eq(document.authorId, userId))
  if (owned >= DOCUMENT_LIMIT_PER_USER) {
    throw Errors.duplicate(`문서는 ${DOCUMENT_LIMIT_PER_USER}개까지 만들 수 있습니다`)
  }

  const created = await documents.create({ authorId: userId, groupId, kind, title, body: text })
  return ok(c, await detail(created, userId), 201)
})

async function detail(doc: DocumentRow, userId: number) {
  const role = doc.groupId === null ? null : await memberRole(doc.groupId, userId)
  const [summary] = await toSummaries([doc], userId)
  return { ...summary, body: doc.body, permissions: permissionsOf(doc, userId, role), myRole: role }
}

documentsApi.get(ID, requireAuth, async (c) => {
  const userId = c.get('userId')
  const { doc } = await loadReadable(parseId(c.req.param('id'), 'id'), userId)
  return ok(c, await detail(doc, userId))
})

// 보낸 것만 바꾼다. version 을 같이 보내면 동시에 수정한 경우 409 로 알려준다
documentsApi.patch(ID, requireAuth, async (c) => {
  const userId = c.get('userId')
  const id = parseId(c.req.param('id'), 'id')
  const body = toCamelCase(await readJsonBody(c)) as {
    title?: unknown
    body?: unknown
    pinned?: unknown
    version?: unknown
  }
  if (body.title === undefined && body.body === undefined && body.pinned === undefined) {
    throw Errors.invalidInput('title, body, pinned 중 하나는 보내야 함')
  }
  if (body.pinned !== undefined && typeof body.pinned !== 'boolean') {
    throw Errors.invalidInput('pinned는 true 또는 false')
  }

  const updated = await documents.update(id, userId, {
    title: body.title === undefined ? undefined : readTitle(body.title),
    body: body.body === undefined ? undefined : readBody(body.body),
    pinned: body.pinned as boolean | undefined,
    version: body.version === undefined ? undefined : parseId(body.version, 'version'),
  })
  return ok(c, await detail(updated, userId))
})

documentsApi.delete(ID, requireAuth, async (c) => {
  const userId = c.get('userId')
  const { doc, role } = await loadReadable(parseId(c.req.param('id'), 'id'), userId)
  if (!canDelete(doc, userId, role)) throw Errors.forbidden('삭제 권한이 없습니다')
  await db.delete(document).where(eq(document.id, doc.id))
  return ok(c, { id: doc.id })
})

// 같은 자리에 복사본을 새로 만든다. 보고서는 항상 초안으로 시작한다
documentsApi.post(`${ID}/duplicate`, requireAuth, async (c) => {
  const userId = c.get('userId')
  const { doc } = await loadReadable(parseId(c.req.param('id'), 'id'), userId)

  const owned = await db.$count(document, eq(document.authorId, userId))
  if (owned >= DOCUMENT_LIMIT_PER_USER) {
    throw Errors.duplicate(`문서는 ${DOCUMENT_LIMIT_PER_USER}개까지 만들 수 있습니다`)
  }
  const created = await documents.create({
    authorId: userId,
    groupId: doc.groupId,
    kind: doc.kind,
    title: truncate(`${doc.title} (복사본)`, DOCUMENT_TITLE_MAX),
    body: doc.body,
  })
  return ok(c, await detail(created, userId), 201)
})

// 마크다운 파일로 내려받기
documentsApi.get(`${ID}/export`, requireAuth, async (c) => {
  const userId = c.get('userId')
  const { doc } = await loadReadable(parseId(c.req.param('id'), 'id'), userId)
  const [author] = await db
    .select({ nickname: user.nickname, tag: user.tag })
    .from(user)
    .where(eq(user.id, doc.authorId))

  const lines = [`# ${doc.title}`, '']
  lines.push(`- 작성자: ${author ? `${author.nickname}#${author.tag}` : '알 수 없음'}`)
  lines.push(`- 수정일: ${doc.updatedAt.toISOString().slice(0, 10)}`)
  if (doc.status) lines.push(`- 상태: ${STATUS_LABEL[doc.status]}`)
  lines.push('', doc.body, '')

  const fileName = `${doc.title.replace(/[\\/:*?"<>|\r\n]/g, '_')}.md`
  c.header('content-type', 'text/markdown; charset=utf-8')
  c.header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`)
  return c.body(lines.join('\n'))
})

const STATUS_LABEL = { draft: '작성 중', pending: '검토 중', approved: '승인', rejected: '반려' }

// 이전 버전 목록
documentsApi.get(`${ID}/revisions`, requireAuth, async (c) => {
  const userId = c.get('userId')
  const { doc } = await loadReadable(parseId(c.req.param('id'), 'id'), userId)
  const rows = await db
    .select({
      version: documentRevision.version,
      title: documentRevision.title,
      editorId: documentRevision.editorId,
      nickname: user.nickname,
      tag: user.tag,
      createdAt: documentRevision.createdAt,
    })
    .from(documentRevision)
    .innerJoin(user, eq(user.id, documentRevision.editorId))
    .where(eq(documentRevision.documentId, doc.id))
    .orderBy(desc(documentRevision.version))
  return ok(c, {
    currentVersion: doc.version,
    revisions: rows.map((r) => ({
      version: r.version,
      title: r.title,
      editor: { id: r.editorId, nickname: r.nickname, tag: r.tag },
      createdAt: r.createdAt,
    })),
  })
})

documentsApi.get(`${ID}/revisions/:version{[1-9][0-9]*}`, requireAuth, async (c) => {
  const userId = c.get('userId')
  const { doc } = await loadReadable(parseId(c.req.param('id'), 'id'), userId)
  const version = parseId(c.req.param('version'), 'version')
  const [row] = await db
    .select()
    .from(documentRevision)
    .where(and(eq(documentRevision.documentId, doc.id), eq(documentRevision.version, version)))
  if (!row) throw Errors.notFound('없는 버전')
  return ok(c, { version: row.version, title: row.title, body: row.body, createdAt: row.createdAt })
})

// 이전 버전으로 되돌린다. 지금 내용도 새 이전 버전으로 남는다
documentsApi.post(`${ID}/revisions/:version{[1-9][0-9]*}/restore`, requireAuth, async (c) => {
  const userId = c.get('userId')
  const restored = await documents.restore(
    parseId(c.req.param('id'), 'id'),
    userId,
    parseId(c.req.param('version'), 'version'),
  )
  return ok(c, await detail(restored, userId))
})

documentsApi.put(`${ID}/bookmark`, requireAuth, async (c) => {
  const userId = c.get('userId')
  const { doc } = await loadReadable(parseId(c.req.param('id'), 'id'), userId)
  const owned = await db.$count(documentBookmark, eq(documentBookmark.userId, userId))
  const already = await db.$count(
    documentBookmark,
    and(eq(documentBookmark.userId, userId), eq(documentBookmark.documentId, doc.id)),
  )
  if (!already && owned >= BOOKMARK_MAX) {
    throw Errors.duplicate(`북마크는 ${BOOKMARK_MAX}개까지 할 수 있습니다`)
  }
  await db.insert(documentBookmark).values({ userId, documentId: doc.id }).onDuplicateKeyUpdate({
    set: { userId },
  })
  return ok(c, { id: doc.id, bookmarked: true })
})

documentsApi.delete(`${ID}/bookmark`, requireAuth, async (c) => {
  const userId = c.get('userId')
  const id = parseId(c.req.param('id'), 'id')
  if (!(await findDocument(id))) throw Errors.notFound('없는 문서')
  await db
    .delete(documentBookmark)
    .where(and(eq(documentBookmark.userId, userId), eq(documentBookmark.documentId, id)))
  return ok(c, { id, bookmarked: false })
})
