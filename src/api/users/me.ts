import { Hono } from 'hono'
import {
  EXP_HISTORY_LIMIT,
  HOME_RECOMMEND_LIMIT,
  PROFILE_VISIBILITY,
  STUDY_LANGUAGE,
  STUDY_LEVEL,
  SUBMISSION_PAGE_LIMIT,
  SUBMISSION_PAGE_LIMIT_MAX,
} from '../../util/config/constants'
import { findRecentExp } from '../../util/db/exp'
import { invites } from '../../util/db/invites'
import { lessons } from '../../util/db/lessons'
import { submissions } from '../../util/db/submissions'
import { users } from '../../util/db/users'
import { type AuthEnv, requireAuth } from '../../util/http/auth'
import { toCamelCase, toSnakeCase } from '../../util/http/case'
import { Errors, ok } from '../../util/http/response'
import {
  currentUnitId,
  findUnit,
  streakDays,
  unitProgress,
  unitsOfLanguage,
} from '../../util/learning'
import { problemMetaById, problems } from '../../util/problems'
import { withFreeTag } from '../../util/sign'
import { clearRefreshCookie } from '../social/login'

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
    avatarUrl: user.avatarUrl,
    email: user.email,
    tier: user.tier,
    totalExp: user.totalExp,
    studyLanguage: user.studyLanguage,
    studyLevel: user.studyLevel,
    onboarded: user.studyLevel !== null,
    allowFriendRequests: user.allowFriendRequests,
    profileVisibility: user.profileVisibility,
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

// 연속 학습은 최근 1년 남짓만 본다
const STREAK_WINDOW_MS = 400 * 24 * 60 * 60 * 1000

// 메인페이지. 학습 통계 + 지금 공부 중인 단원 + 추천 문제를 한 번에 준다
me.get('/home', requireAuth, async (c) => {
  const userId = c.get('userId')
  const user = await findMe(userId)

  const [{ total, correct }, solved, submittedAt] = await Promise.all([
    submissions.countByUser(userId),
    submissions.solvedMapByUser(userId),
    submissions.submittedAtSince(userId, new Date(Date.now() - STREAK_WINDOW_MS)),
  ])

  const unitId = currentUnitId(user.studyUnitId, solved, user.studyLanguage)
  const found = unitId ? findUnit(unitId) : undefined

  let currentUnit = null
  let recommendations: unknown[] = []
  if (found) {
    const progress = unitProgress(found.unit, solved)
    currentUnit = {
      unitId: found.unit.unitId,
      title: found.unit.title,
      courseTitle: found.course.title,
      solved: progress.solved,
      total: progress.total,
      // 다음 단원이 열리려면 남은 문제 수
      remainingToUnlock: progress.remaining,
      nextStageTitle: found.next?.unit.title ?? null,
    }

    // 지금 단원에서 아직 못 맞힌 문제부터. progress 는 그 유형을 단원에서 몇 개 맞혔는지
    recommendations = progress.problems
      .filter((p) => p.status !== 'correct')
      .slice(0, HOME_RECOMMEND_LIMIT)
      .map((p) => {
        const sameType = progress.problems.filter((q) => q.type === p.type)
        return {
          problemId: p.id,
          title: p.title,
          type: p.type,
          typeLabel: p.typeLabel,
          xp: p.reward,
          progress: {
            solved: sameType.filter((q) => q.status === 'correct').length,
            total: sameType.length,
          },
        }
      })
  }

  return ok(c, {
    stats: {
      solvedCount: [...solved.values()].filter(Boolean).length,
      accuracy: total === 0 ? 0 : Math.round((correct / total) * 1000) / 10,
      streakDays: streakDays(submittedAt),
      totalExp: user.totalExp,
    },
    currentUnit,
    recommendations,
  })
})

// 친구 요청 허용과 프로필 공개 범위 조회. 설정 화면에서 고를 수 있는 공개 범위 목록도 같이 준다
me.get('/privacy', requireAuth, async (c) => {
  const user = await findMe(c.get('userId'))
  return ok(c, {
    allowFriendRequests: user.allowFriendRequests,
    profileVisibility: user.profileVisibility,
    visibilityOptions: PROFILE_VISIBILITY,
  })
})

// 개인정보 설정 변경. allow_friend_requests, profile_visibility 중 보낸 것만 바꾼다
me.patch('/privacy', requireAuth, async (c) => {
  const body = toCamelCase((await c.req.json().catch(() => ({}))) as Record<string, unknown>) as {
    allowFriendRequests?: unknown
    profileVisibility?: unknown
  }
  if (body.allowFriendRequests === undefined && body.profileVisibility === undefined) {
    throw Errors.invalidInput('allow_friend_requests 나 profile_visibility 중 하나는 보내야 함')
  }
  if (body.allowFriendRequests !== undefined && typeof body.allowFriendRequests !== 'boolean') {
    throw Errors.invalidInput('allow_friend_requests 는 true 또는 false')
  }
  if (
    body.profileVisibility !== undefined &&
    !PROFILE_VISIBILITY.includes(body.profileVisibility as (typeof PROFILE_VISIBILITY)[number])
  ) {
    throw Errors.invalidInput(`profile_visibility 는 ${PROFILE_VISIBILITY.join(', ')} 중 하나`)
  }

  const userId = c.get('userId')
  await findMe(userId)
  await users.updatePrivacy(userId, {
    allowFriendRequests: body.allowFriendRequests as boolean | undefined,
    profileVisibility: body.profileVisibility as (typeof PROFILE_VISIBILITY)[number] | undefined,
  })

  const user = await findMe(userId)
  return ok(c, {
    allowFriendRequests: user.allowFriendRequests,
    profileVisibility: user.profileVisibility,
  })
})

// 언어별 학습 진행. 완료한 레슨 목록과 단원별 문제 풀이 진행률을 같이 준다.
// language 를 안 보내면 내 학습 언어
me.get('/progress', requireAuth, async (c) => {
  const userId = c.get('userId')
  const user = await findMe(userId)

  const language = c.req.query('language') ?? user.studyLanguage
  if (!isLanguage(language)) {
    throw Errors.invalidInput(`language 는 ${STUDY_LANGUAGE.join(', ')} 중 하나`)
  }

  const [done, solved] = await Promise.all([
    lessons.listByUser(userId, language),
    submissions.solvedMapByUser(userId),
  ])

  return ok(c, {
    language,
    lessons: done.map((row) => ({ lessonId: row.lessonId, completedAt: row.completedAt })),
    completedLessonCount: done.length,
    units: unitsOfLanguage(language).map(({ course, unit }) => {
      const progress = unitProgress(unit, solved)
      return {
        unitId: unit.unitId,
        title: unit.title,
        courseId: course.courseId,
        courseTitle: course.title,
        order: unit.order,
        total: progress.total,
        solved: progress.solved,
        completePercent: progress.completePercent,
      }
    }),
  })
})

// 받은 그룹 초대 목록. id 가 수락/거절 API 의 {id}
me.get('/group-invites', requireAuth, async (c) => {
  const items = await invites.listForUser(c.get('userId'))
  return ok(c, { items })
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

// 오답노트 복습 완료. 틀렸다가 다시 맞힌 문제를 다시 맞힌 순서대로 최신순으로 준다
me.get('/wrong-notes/reviewed', requireAuth, async (c) => {
  const userId = c.get('userId')

  const limit = parseLimit(c.req.query('limit'), SUBMISSION_PAGE_LIMIT, SUBMISSION_PAGE_LIMIT_MAX)
  const cursor = parseCursor(c.req.query('cursor'))

  // 다음 페이지 존재 여부를 위해 1개 더 조회
  const rows = await submissions.findReviewedByUser(userId, { cursor, limit: limit + 1 })
  const items = rows.slice(0, limit)
  const nextCursor = rows.length > limit ? items[items.length - 1].id : null

  return ok(c, {
    reviewed: items.map((row) => {
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
        reviewedAt: row.createdAt,
      }
    }),
    nextCursor,
  })
})

// 회원 탈퇴. 내 기록은 모두 함께 지워진다.
// 다른 멤버가 있는 그룹의 방장이면 막고, 먼저 방장을 넘겨야 할 그룹 목록을 알려준다.
// 나 혼자 남은 그룹은 계정과 같이 사라진다
me.delete('/', requireAuth, async (c) => {
  const userId = c.get('userId')
  await findMe(userId)

  const groups = await users.ownedGroupsWithOtherMembers(userId)
  if (groups.length > 0) {
    return c.json(
      toSnakeCase({
        success: false,
        error: {
          code: 'OWNS_GROUPS',
          message: '방장인 그룹의 방장을 먼저 다른 멤버에게 넘겨주세요',
          groups,
        },
      }),
      409,
    )
  }

  await users.remove(userId)
  clearRefreshCookie(c)
  return c.body(null, 204)
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
