import { Hono } from 'hono'
import { SUBMISSION_PAGE_LIMIT, SUBMISSION_PAGE_LIMIT_MAX } from '../../util/config/constants'
import { submissions } from '../../util/db/submissions'
import { users } from '../../util/db/users'
import { type AuthEnv, requireAuth } from '../../util/http/auth'
import { Errors, ok } from '../../util/http/response'
import { problemMetaById } from '../../util/problems'
import { withFreeTag } from '../../util/sign'

export const me = new Hono<AuthEnv>()

me.patch('/nickname', requireAuth, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { nickname?: unknown }
  const userId = c.get('userId')
  const input = body.nickname
  const nickname = typeof input === 'string' ? input.trim().replace(/\s+/g, ' ') : ''
  if (nickname.length < 2 || nickname.length > 20) throw Errors.invalidInput('닉네임은 2~20자')
  if (!(await users.findById(userId))) throw Errors.notFound('없는 사용자')
  const result = await withFreeTag(async (tag) => {
    await users.updateNickname(userId, nickname, tag)
    return { nickname, tag }
  })
  return ok(c, result)
})

// 내 제출 이력. 최신순(id 내림차순)이며 cursor는 다음 페이지 조회용 마지막 제출 id
me.get('/submissions', requireAuth, async (c) => {
  const userId = c.get('userId')

  const limit = parseLimit(c.req.query('limit'), SUBMISSION_PAGE_LIMIT, SUBMISSION_PAGE_LIMIT_MAX)
  const cursor = parseCursor(c.req.query('cursor'))

  // 다음 페이지 존재 여부를 위해 1개 더 조회
  const rows = await submissions.findHistoryByUser(userId, { cursor, limit: limit + 1 })
  const items = rows.slice(0, limit)
  const nextCursor = rows.length > limit ? items[items.length - 1].id : null

  return ok(c, {
    submissions: items.map((row) => {
      const meta = problemMetaById.get(row.problemId)
      return {
        id: row.id,
        problemId: row.problemId,
        type: meta?.type ?? null,
        title: meta?.title ?? null,
        difficulty: meta?.difficulty ?? null,
        language: meta?.language ?? null,
        unitId: meta?.unitId ?? null,
        isCorrect: row.isCorrect,
        answer: row.answer,
        runOutput: row.runOutput,
        createdAt: row.createdAt,
      }
    }),
    nextCursor,
  })
})

// 오답노트. 아직 못 맞춘 문제만, 문제별 최근 오답 1건씩 최신순
me.get('/wrong-notes', requireAuth, async (c) => {
  const userId = c.get('userId')

  const limit = parseLimit(c.req.query('limit'), SUBMISSION_PAGE_LIMIT, SUBMISSION_PAGE_LIMIT_MAX)
  const cursor = parseCursor(c.req.query('cursor'))

  // 다음 페이지 존재 여부를 위해 1개 더 조회
  const rows = await submissions.findWrongNotesByUser(userId, { cursor, limit: limit + 1 })
  const items = rows.slice(0, limit)
  const nextCursor = rows.length > limit ? items[items.length - 1].id : null

  return ok(c, {
    wrongNotes: items.map((row) => {
      const meta = problemMetaById.get(row.problemId)
      return {
        submissionId: row.id,
        problemId: row.problemId,
        type: meta?.type ?? null,
        title: meta?.title ?? null,
        difficulty: meta?.difficulty ?? null,
        language: meta?.language ?? null,
        unitId: meta?.unitId ?? null,
        myAnswer: row.answer,
        runOutput: row.runOutput,
        wrongAt: row.createdAt,
      }
    }),
    nextCursor,
  })
})

function parseLimit(raw: string | undefined, fallback: number, max: number): number {
  const n = Number(raw)
  if (Number.isInteger(n) && n > 0) return Math.min(n, max)
  return fallback
}

function parseCursor(raw: string | undefined): number | undefined {
  if (!raw || !/^\d+$/.test(raw)) return undefined
  return Number(raw)
}
