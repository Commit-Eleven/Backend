import { and, count, desc, eq, inArray, notInArray } from 'drizzle-orm'
import {
  DOCUMENT_EXCERPT_LENGTH,
  type GROUP_ROLE,
  type REVIEW_DECISION,
  REVISION_KEEP,
} from '../config/constants'
import { AppError, Errors } from '../http/response'
import { excerpt } from '../text'
import { db } from './connection'
import {
  document,
  documentBookmark,
  documentComment,
  documentReview,
  documentRevision,
  groupMember,
  user,
} from './schema'

export type DocumentRow = typeof document.$inferSelect
export type GroupRole = (typeof GROUP_ROLE)[number]
type ReviewDecision = (typeof REVIEW_DECISION)[number]

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export const isManager = (role: GroupRole | null): boolean => role === 'owner' || role === 'manager'

export async function memberRole(groupId: number, userId: number): Promise<GroupRole | null> {
  const [row] = await db
    .select({ role: groupMember.role })
    .from(groupMember)
    .where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, userId)))
  return row?.role ?? null
}

// 내가 들어간 그룹과 역할
export async function myRoles(userId: number): Promise<Map<number, GroupRole>> {
  const rows = await db
    .select({ groupId: groupMember.groupId, role: groupMember.role })
    .from(groupMember)
    .where(eq(groupMember.userId, userId))
  return new Map(rows.map((r) => [r.groupId, r.role]))
}

// 보고서는 쓴 사람과 관리자만 보고, 승인된 뒤에는 팀원 모두가 본다
export function canRead(doc: DocumentRow, userId: number, role: GroupRole | null): boolean {
  if (doc.groupId === null) return doc.authorId === userId
  if (role === null) return false
  if (doc.kind === 'wiki') return true
  return doc.authorId === userId || isManager(role) || doc.status === 'approved'
}

export function canEdit(doc: DocumentRow, userId: number, role: GroupRole | null): boolean {
  if (doc.groupId === null) return doc.authorId === userId
  if (role === null) return false
  if (doc.kind === 'wiki') return doc.authorId === userId || isManager(role)
  return doc.authorId === userId && (doc.status === 'draft' || doc.status === 'rejected')
}

export function canDelete(doc: DocumentRow, userId: number, role: GroupRole | null): boolean {
  if (doc.groupId === null) return doc.authorId === userId
  if (role === null) return false
  if (isManager(role)) return true
  if (doc.kind === 'wiki') return doc.authorId === userId
  return doc.authorId === userId && (doc.status === 'draft' || doc.status === 'rejected')
}

// 방장은 자기 보고서도 승인할 수 있다. 관리자는 남의 보고서만
export function canReview(doc: DocumentRow, userId: number, role: GroupRole | null): boolean {
  if (doc.kind !== 'report' || doc.status !== 'pending') return false
  if (role === 'owner') return true
  return role === 'manager' && doc.authorId !== userId
}

export async function findDocument(id: number): Promise<DocumentRow | undefined> {
  const [row] = await db.select().from(document).where(eq(document.id, id))
  return row
}

// 문서를 읽을 수 있을 때만 돌려준다. 못 읽으면 있는지도 알려주지 않는다
export async function loadReadable(id: number, userId: number) {
  const doc = await findDocument(id)
  if (!doc) throw Errors.notFound('없는 문서')
  const role = doc.groupId === null ? null : await memberRole(doc.groupId, userId)
  if (!canRead(doc, userId, role)) throw Errors.notFound('없는 문서')
  return { doc, role }
}

export async function toSummaries(rows: DocumentRow[], userId: number) {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const authorIds = [...new Set(rows.map((r) => r.authorId))]

  const [authors, bookmarks, comments] = await Promise.all([
    db
      .select({ id: user.id, nickname: user.nickname, tag: user.tag })
      .from(user)
      .where(inArray(user.id, authorIds)),
    db
      .select({ documentId: documentBookmark.documentId })
      .from(documentBookmark)
      .where(and(eq(documentBookmark.userId, userId), inArray(documentBookmark.documentId, ids))),
    db
      .select({ documentId: documentComment.documentId, n: count() })
      .from(documentComment)
      .where(inArray(documentComment.documentId, ids))
      .groupBy(documentComment.documentId),
  ])
  const authorById = new Map(authors.map((a) => [a.id, a]))
  const bookmarked = new Set(bookmarks.map((b) => b.documentId))
  const commentCount = new Map(comments.map((c) => [c.documentId, c.n]))

  return rows.map((row) => ({
    id: row.id,
    groupId: row.groupId,
    kind: row.kind,
    status: row.status,
    title: row.title,
    excerpt: excerpt(row.body, DOCUMENT_EXCERPT_LENGTH),
    pinned: row.pinned,
    version: row.version,
    author: authorById.get(row.authorId) ?? null,
    bookmarked: bookmarked.has(row.id),
    commentCount: commentCount.get(row.id) ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}

// 화면에서 어떤 버튼을 보여줄지 정하는 데 쓴다
export function permissionsOf(doc: DocumentRow, userId: number, role: GroupRole | null) {
  const mine = doc.authorId === userId
  const editable = canEdit(doc, userId, role)
  return {
    canEdit: editable,
    canDelete: canDelete(doc, userId, role),
    canPin: doc.kind === 'wiki' && isManager(role),
    canComment: doc.groupId !== null,
    canSubmit:
      doc.kind === 'report' && mine && (doc.status === 'draft' || doc.status === 'rejected'),
    canWithdraw: doc.kind === 'report' && mine && doc.status === 'pending',
    canReview: canReview(doc, userId, role),
  }
}

// 내용을 바꾸기 전 상태를 남기고, 오래된 것은 지운다
async function saveRevision(tx: Tx, doc: DocumentRow, editorId: number) {
  await tx.insert(documentRevision).values({
    documentId: doc.id,
    version: doc.version,
    editorId,
    title: doc.title,
    body: doc.body,
  })
  const keep = await tx
    .select({ id: documentRevision.id })
    .from(documentRevision)
    .where(eq(documentRevision.documentId, doc.id))
    .orderBy(desc(documentRevision.version))
    .limit(REVISION_KEEP)
  await tx.delete(documentRevision).where(
    and(
      eq(documentRevision.documentId, doc.id),
      notInArray(
        documentRevision.id,
        keep.map((k) => k.id),
      ),
    ),
  )
}

async function lockDocument(tx: Tx, id: number): Promise<DocumentRow> {
  const [doc] = await tx.select().from(document).where(eq(document.id, id)).for('update')
  if (!doc) throw Errors.notFound('없는 문서')
  return doc
}

async function roleIn(tx: Tx, doc: DocumentRow, userId: number): Promise<GroupRole | null> {
  if (doc.groupId === null) return null
  const [row] = await tx
    .select({ role: groupMember.role })
    .from(groupMember)
    .where(and(eq(groupMember.groupId, doc.groupId), eq(groupMember.userId, userId)))
  return row?.role ?? null
}

export type DocumentChanges = {
  title?: string
  body?: string
  pinned?: boolean
  version?: number
}

export const documents = {
  async create(data: {
    authorId: number
    groupId: number | null
    kind: DocumentRow['kind']
    title: string
    body: string
  }): Promise<DocumentRow> {
    const [inserted] = await db
      .insert(document)
      .values({
        authorId: data.authorId,
        groupId: data.groupId,
        kind: data.kind,
        status: data.kind === 'report' ? 'draft' : null,
        title: data.title,
        body: data.body,
      })
      .$returningId()
    const created = await findDocument(inserted.id)
    if (!created) throw Errors.internal()
    return created
  },

  // version 을 같이 보내면 그 사이 다른 사람이 고친 경우 409 로 알려준다
  async update(id: number, userId: number, changes: DocumentChanges): Promise<DocumentRow> {
    await db.transaction(async (tx) => {
      const doc = await lockDocument(tx, id)
      const role = await roleIn(tx, doc, userId)
      if (!canRead(doc, userId, role)) throw Errors.notFound('없는 문서')

      const contentChanged =
        (changes.title !== undefined && changes.title !== doc.title) ||
        (changes.body !== undefined && changes.body !== doc.body)

      if (changes.pinned !== undefined && changes.pinned !== doc.pinned) {
        if (doc.kind !== 'wiki') throw Errors.invalidInput('고정은 위키 문서만 할 수 있습니다')
        if (!isManager(role)) throw Errors.forbidden('관리자만 문서를 고정할 수 있습니다')
      }

      if (contentChanged) {
        if (!canEdit(doc, userId, role)) {
          if (doc.kind === 'report' && doc.authorId === userId) {
            throw Errors.duplicate('검토 중이거나 승인된 보고서는 수정할 수 없습니다')
          }
          throw Errors.forbidden('수정 권한이 없습니다')
        }
        if (changes.version !== undefined && changes.version !== doc.version) {
          throw new VersionConflict(doc.version)
        }
        await saveRevision(tx, doc, userId)
      }

      const set: Partial<typeof document.$inferInsert> = {}
      if (changes.pinned !== undefined) set.pinned = changes.pinned
      if (contentChanged) {
        if (changes.title !== undefined) set.title = changes.title
        if (changes.body !== undefined) set.body = changes.body
        set.version = doc.version + 1
        if (doc.status === 'rejected') set.status = 'draft'
      }
      if (Object.keys(set).length > 0) {
        await tx.update(document).set(set).where(eq(document.id, id))
      }
    })
    const updated = await findDocument(id)
    if (!updated) throw Errors.notFound('없는 문서')
    return updated
  },

  async restore(id: number, userId: number, version: number): Promise<DocumentRow> {
    await db.transaction(async (tx) => {
      const doc = await lockDocument(tx, id)
      const role = await roleIn(tx, doc, userId)
      if (!canRead(doc, userId, role)) throw Errors.notFound('없는 문서')
      if (!canEdit(doc, userId, role)) throw Errors.forbidden('수정 권한이 없습니다')

      const [old] = await tx
        .select()
        .from(documentRevision)
        .where(and(eq(documentRevision.documentId, id), eq(documentRevision.version, version)))
      if (!old) throw Errors.notFound('없는 버전')

      await saveRevision(tx, doc, userId)
      await tx
        .update(document)
        .set({
          title: old.title,
          body: old.body,
          version: doc.version + 1,
          ...(doc.status === 'rejected' ? { status: 'draft' as const } : {}),
        })
        .where(eq(document.id, id))
    })
    const restored = await findDocument(id)
    if (!restored) throw Errors.notFound('없는 문서')
    return restored
  },

  async submit(id: number, userId: number): Promise<DocumentRow> {
    return transition(id, userId, (doc) => {
      if (doc.kind !== 'report') throw Errors.invalidInput('보고서만 제출할 수 있습니다')
      if (doc.authorId !== userId) throw Errors.forbidden('작성자만 제출할 수 있습니다')
      if (doc.status !== 'draft' && doc.status !== 'rejected') {
        throw Errors.duplicate('이미 제출했거나 승인된 보고서입니다')
      }
      if (!doc.body.trim())
        throw Errors.invalidInput('내용이 비어 있는 보고서는 제출할 수 없습니다')
      return 'pending'
    })
  },

  async withdraw(id: number, userId: number): Promise<DocumentRow> {
    return transition(id, userId, (doc) => {
      if (doc.kind !== 'report') throw Errors.invalidInput('보고서만 회수할 수 있습니다')
      if (doc.authorId !== userId) throw Errors.forbidden('작성자만 회수할 수 있습니다')
      if (doc.status !== 'pending') throw Errors.duplicate('검토 중인 보고서만 회수할 수 있습니다')
      return 'draft'
    })
  },

  // 승인이나 반려. 같은 보고서를 두 사람이 동시에 처리하지 못하게 행을 잠근다
  async review(
    id: number,
    reviewerId: number,
    decision: ReviewDecision,
    comment: string | null,
  ): Promise<DocumentRow> {
    await db.transaction(async (tx) => {
      const doc = await lockDocument(tx, id)
      const role = await roleIn(tx, doc, reviewerId)
      if (!canRead(doc, reviewerId, role)) throw Errors.notFound('없는 문서')
      if (doc.kind !== 'report') throw Errors.invalidInput('보고서만 검토할 수 있습니다')
      if (!isManager(role)) throw Errors.forbidden('관리자만 검토할 수 있습니다')
      if (doc.status !== 'pending') throw Errors.duplicate('검토 중인 보고서가 아닙니다')
      if (!canReview(doc, reviewerId, role)) {
        throw Errors.forbidden('내 보고서는 방장만 승인할 수 있습니다')
      }

      await tx.insert(documentReview).values({ documentId: id, reviewerId, decision, comment })
      await tx.update(document).set({ status: decision }).where(eq(document.id, id))
    })
    const reviewed = await findDocument(id)
    if (!reviewed) throw Errors.notFound('없는 문서')
    return reviewed
  },
}

async function transition(
  id: number,
  userId: number,
  next: (doc: DocumentRow) => DocumentRow['status'],
): Promise<DocumentRow> {
  await db.transaction(async (tx) => {
    const doc = await lockDocument(tx, id)
    const role = await roleIn(tx, doc, userId)
    if (!canRead(doc, userId, role)) throw Errors.notFound('없는 문서')
    await tx
      .update(document)
      .set({ status: next(doc) })
      .where(eq(document.id, id))
  })
  const changed = await findDocument(id)
  if (!changed) throw Errors.notFound('없는 문서')
  return changed
}

// 동시에 고쳤을 때. 현재 버전을 같이 알려준다
class VersionConflict extends AppError {
  constructor(public currentVersion: number) {
    super(
      'VERSION_CONFLICT',
      `다른 사람이 먼저 수정했습니다. 현재 버전은 ${currentVersion}입니다`,
      409,
    )
  }
}
