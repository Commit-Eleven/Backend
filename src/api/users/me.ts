import { Hono } from 'hono'
import {
  EXP_HISTORY_LIMIT,
  STUDY_LANGUAGE,
  STUDY_LEVEL,
  SUBMISSION_PAGE_LIMIT,
  SUBMISSION_PAGE_LIMIT_MAX,
} from '../../util/config/constants'
import { findRecentExp } from '../../util/db/exp'
import { submissions } from '../../util/db/submissions'
import { users } from '../../util/db/users'
import { type AuthEnv, requireAuth } from '../../util/http/auth'
import { toCamelCase } from '../../util/http/case'
import { Errors, ok } from '../../util/http/response'
import { problemMetaById, problems } from '../../util/problems'
import { withFreeTag } from '../../util/sign'

export const me = new Hono<AuthEnv>()

type Language = (typeof STUDY_LANGUAGE)[number]
type Level = (typeof STUDY_LEVEL)[number]
const isLanguage = (v: unknown): v is Language => STUDY_LANGUAGE.includes(v as Language)
const isLevel = (v: unknown): v is Level => STUDY_LEVEL.includes(v as Level)

async function findMe(userId: number) {
  const user = await users.findById(userId)
  if (!user) throw Errors.notFound('없는 사용자')
  return user
}

// 내 프로필 및 설정. 내 거라 이메일까지 준다 (구글 id 는 빼고)
me.get('/', requireAuth, async (c) => {
  const user = await findMe(c.get('userId'))
  return ok(c, {
    id: user.id,
    nickname: user.nickname,
    tag: user.tag,
    email: user.email,
    tier: user.tier,
    totalExp: user.totalExp,
    studyLanguage: user.studyLanguage,
    studyLevel: user.studyLevel,
    onboarded: user.studyLevel !== null,
    createdAt: user.createdAt,
  })
})

// 내 경험치. 총합과 최근에 얻은 기록
me.get('/exp', requireAuth, async (c) => {
  const userId = c.get('userId')
  const user = await findMe(userId)
  const rows = await findRecentExp(userId, EXP_HISTORY_LIMIT)

  return ok(c, {
    totalExp: user.totalExp,
    tier: user.tier,
    recent: rows.map((row) => ({
      amount: row.amount,
      reason: row.reason,
      problemId: row.problemId,
      problemTitle: row.problemId ? (problemMetaById.get(row.problemId)?.title ?? null) : null,
      createdAt: row.createdAt,
    })),
  })
})

// 언어 및 등급 조회. 설정 화면에서 쓰라고 고를 수 있는 목록도 같이 준다
me.get('/learning', requireAuth, async (c) => {
  const user = await findMe(c.get('userId'))
  return ok(c, {
    studyLanguage: user.studyLanguage,
    studyLevel: user.studyLevel,
    tier: user.tier,
    languages: STUDY_LANGUAGE,
    levels: STUDY_LEVEL,
  })
})

// 학습설정 변경. language, level 중 보낸 것만 바꾼다
me.patch('/learning', requireAuth, async (c) => {
  const body = toCamelCase((await c.req.json().catch(() => ({}))) as Record<string, unknown>) as {
    language?: unknown
    level?: unknown
  }
  if (body.language === undefined && body.level === undefined) {
    throw Errors.invalidInput('language 나 level 중 하나는 보내야 함')
  }
  if (body.language !== undefined && !isLanguage(body.language)) {
    throw Errors.invalidInput(`language 는 ${STUDY_LANGUAGE.join(', ')} 중 하나`)
  }
  if (body.level !== undefined && !isLevel(body.level)) {
    throw Errors.invalidInput(`level 은 ${STUDY_LEVEL.join(', ')} 중 하나`)
  }

  const userId = c.get('userId')
  await findMe(userId)
  await users.updateLearning(userId, {
    studyLanguage: body.language as Language | undefined,
    studyLevel: body.level as Level | undefined,
  })

  const user = await findMe(userId)
  return ok(c, { studyLanguage: user.studyLanguage, studyLevel: user.studyLevel })
})

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

// 학습 통계. submission에 쌓인 제출 기록을 그때그때 집계한다
me.get('/stats', requireAuth, async (c) => {
  const userId = c.get('userId')
  const user = await users.findById(userId)
  if (!user) throw Errors.notFound('없는 사용자')

  const { total, correct } = await submissions.countByUser(userId)
  const solvedIds = new Set(await submissions.findSolvedProblemIds(userId))

  // 유형별로 전체 문제 수와 그중 맞춘 문제 수
  const byType = new Map<string, { type: string; solved: number; total: number }>()
  for (const problem of problems) {
    const row = byType.get(problem.type) ?? { type: problem.type, solved: 0, total: 0 }
    row.total += 1
    if (solvedIds.has(problem.id)) row.solved += 1
    byType.set(problem.type, row)
  }

  return ok(c, {
    totalExp: user.totalExp,
    tier: user.tier,
    studyLanguage: user.studyLanguage,
    studyLevel: user.studyLevel,
    submissionCount: total,
    correctCount: correct,
    wrongCount: total - correct,
    // 정답률(%), 소수 첫째 자리까지. 제출이 없으면 0
    accuracy: total === 0 ? 0 : Math.round((correct / total) * 1000) / 10,
    solvedProblemCount: solvedIds.size,
    totalProblemCount: problems.length,
    byType: [...byType.values()],
  })
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
