import { and, asc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { DOCUMENT_COMMENT_MAX, DOCUMENT_PAGE_SIZE_MAX } from '../util/config/constants'
import { db } from '../util/db/connection'
import { isManager, loadReadable } from '../util/db/documents'
import { notify } from '../util/db/notify'
import { documentComment, user } from '../util/db/schema'
import { type AuthEnv, requireAuth } from '../util/http/auth'
import { readJsonBody } from '../util/http/body'
import { toCamelCase } from '../util/http/case'
import { parseId, parseQueryInt } from '../util/http/params'
import { Errors, ok } from '../util/http/response'

const ID = '/:id{[1-9][0-9]*}'

export const documentComments = new Hono<AuthEnv>()

documentComments.get(`${ID}/comments`, requireAuth, async (c) => {
  const { doc } = await loadReadable(parseId(c.req.param('id'), 'id'), c.get('userId'))
  const page = parseQueryInt(c.req.query('page'), 1, 'page')
  const limit = parseQueryInt(
    c.req.query('limit'),
    DOCUMENT_PAGE_SIZE_MAX,
    'limit',
    DOCUMENT_PAGE_SIZE_MAX,
  )
  const offset = (page - 1) * limit
  if (!Number.isSafeInteger(offset)) throw Errors.invalidInput('page가 너무 큽니다')

  const rows = await db
    .select({
      id: documentComment.id,
      body: documentComment.body,
      createdAt: documentComment.createdAt,
      authorId: documentComment.authorId,
      nickname: user.nickname,
      tag: user.tag,
    })
    .from(documentComment)
    .innerJoin(user, eq(user.id, documentComment.authorId))
    .where(eq(documentComment.documentId, doc.id))
    .orderBy(asc(documentComment.id))
    .limit(limit)
    .offset(offset)
  const total = await db.$count(documentComment, eq(documentComment.documentId, doc.id))

  return ok(c, {
    comments: rows.map((r) => ({
      id: r.id,
      body: r.body,
      author: { id: r.authorId, nickname: r.nickname, tag: r.tag },
      createdAt: r.createdAt,
    })),
    page,
    limit,
    total,
  })
})

// 팀 문서에만 댓글을 달 수 있다. 문서 작성자에게 알림이 간다
documentComments.post(`${ID}/comments`, requireAuth, async (c) => {
  const userId = c.get('userId')
  const { doc } = await loadReadable(parseId(c.req.param('id'), 'id'), userId)
  if (doc.groupId === null) throw Errors.invalidInput('개인 노트에는 댓글을 달 수 없습니다')

  const body = toCamelCase(await readJsonBody(c)) as { body?: unknown }
  if (typeof body.body !== 'string' || !body.body.trim()) throw Errors.invalidInput('body 필요')
  const text = body.body.trim()
  if (Array.from(text).length > DOCUMENT_COMMENT_MAX) {
    throw Errors.invalidInput(`body는 ${DOCUMENT_COMMENT_MAX}자 이하`)
  }

  const [inserted] = await db
    .insert(documentComment)
    .values({ documentId: doc.id, authorId: userId, body: text })
    .$returningId()
  if (doc.authorId !== userId) {
    await notify([doc.authorId], 'document_comment', {
      documentId: doc.id,
      groupId: doc.groupId,
      title: doc.title,
      commentId: inserted.id,
      authorId: userId,
    })
  }
  return ok(c, { id: inserted.id, documentId: doc.id, body: text }, 201)
})

// 댓글 쓴 사람, 문서 작성자, 팀 관리자가 지울 수 있다
documentComments.delete(`${ID}/comments/:commentId{[1-9][0-9]*}`, requireAuth, async (c) => {
  const userId = c.get('userId')
  const { doc, role } = await loadReadable(parseId(c.req.param('id'), 'id'), userId)
  const commentId = parseId(c.req.param('commentId'), 'comment_id')

  const [comment] = await db
    .select()
    .from(documentComment)
    .where(and(eq(documentComment.id, commentId), eq(documentComment.documentId, doc.id)))
  if (!comment) throw Errors.notFound('없는 댓글')
  if (comment.authorId !== userId && doc.authorId !== userId && !isManager(role)) {
    throw Errors.forbidden('삭제 권한이 없습니다')
  }
  await db.delete(documentComment).where(eq(documentComment.id, commentId))
  return ok(c, { id: commentId })
})
