import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '../../util/db/connection'
import { submission } from '../../util/db/schema'
import { type AuthEnv, requireAuth } from '../../util/http/auth'
import { Errors, ok } from '../../util/http/response'
import { getProblemSummary } from './catalog'

/** 문제별 최신 제출만 */
async function latestByProblemIds(
  userId: number,
  problemIds: string[],
): Promise<{ problemId: string; isCorrect: boolean }[]> {
  if (problemIds.length === 0) return []

  const rows = await db
    .select({ problemId: submission.problemId, isCorrect: submission.isCorrect })
    .from(submission)
    .where(and(eq(submission.userId, userId), inArray(submission.problemId, problemIds)))
    .orderBy(desc(submission.createdAt))

  const latestByProblemId = new Map<string, boolean>()
  for (const row of rows) {
    if (!latestByProblemId.has(row.problemId)) {
      latestByProblemId.set(row.problemId, row.isCorrect)
    }
  }
  return [...latestByProblemId.entries()].map(([problemId, isCorrect]) => ({
    problemId,
    isCorrect,
  }))
}

type Unit = {
  unitId: string
  title: string
  order: number
  problemIds: string[]
}

type Course = {
  courseId: string
  title: string
  units: Unit[]
}

const courses = (await Bun.file('static/curriculum/curriculum.json').json()) as Course[]
for (const course of courses) {
  for (const unit of course.units) {
    for (const problemId of unit.problemIds) {
      if (!getProblemSummary(problemId)) {
        throw new Error(`커리큘럼에 없는 문제 id: ${problemId} (unit: ${unit.unitId})`)
      }
    }
  }
}

function findUnit(unitId: string): { course: Course; unit: Unit } | undefined {
  for (const course of courses) {
    const unit = course.units.find((u) => u.unitId === unitId)
    if (unit) return { course, unit }
  }
  return undefined
}

type ProblemStatus = 'correct' | 'wrong' | 'todo'

function completePercentOf(solved: number, total: number): number {
  return total === 0 ? 0 : Math.round((solved / total) * 100)
}

/** 연속 제출일수 */
function countStreakDays(submissionDates: string[]): number {
  const daySet = new Set(submissionDates)
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)

  let streak = 0
  while (daySet.has(cursor.toISOString().slice(0, 10))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

// curriculum 조회와 같은 단원 요약 모양
async function summarizeUnit(userId: number, unit: Unit, unlocked: boolean) {
  const latest = await latestByProblemIds(userId, unit.problemIds)
  const solved = latest.filter((s) => s.isCorrect).length
  const total = unit.problemIds.length

  return {
    unitId: unit.unitId,
    title: unit.title,
    order: unit.order,
    total,
    solved,
    completePercent: completePercentOf(solved, total),
    unlocked,
  }
}

async function getUnitDetail(userId: number, unitId: string) {
  const found = findUnit(unitId)
  if (!found) throw Errors.notFound('없는 단원')
  const { course, unit } = found

  const latest = await latestByProblemIds(userId, unit.problemIds)
  const statusByProblemId = new Map<string, ProblemStatus>(
    latest.map((s) => [s.problemId, s.isCorrect ? 'correct' : 'wrong']),
  )

  const problems = unit.problemIds.map((problemId, i) => {
    const summary = getProblemSummary(problemId)
    return {
      index: i + 1,
      id: problemId,
      type: summary?.type,
      title: summary?.title,
      status: statusByProblemId.get(problemId) ?? ('todo' as const),
    }
  })

  const solved = problems.filter((p) => p.status === 'correct').length
  const wrong = problems.filter((p) => p.status === 'wrong').length
  const completePercent = completePercentOf(solved, problems.length)
  const next = course.units.find((next) => next.order === unit.order + 1)
  // 다음 단원 잠금 해제: 직전 단원 완료율 100%
  const nextUnit = next ? await summarizeUnit(userId, next, completePercent === 100) : null

  return {
    unitId: unit.unitId,
    title: unit.title,
    completePercent,
    solved,
    wrong,
    remaining: problems.length - solved - wrong,
    problems,
    nextUnit,
  }
}

export const learning = new Hono<AuthEnv>()

learning.get('/stats', requireAuth, async (c) => {
  const userId = c.get('userId')
  const [solved, counts, dates] = await Promise.all([
    db
      .select({ count: sql<number>`count(distinct ${submission.problemId})` })
      .from(submission)
      .where(and(eq(submission.userId, userId), eq(submission.isCorrect, true))),
    db
      .select({ total: sql<number>`count(*)`, correct: sql<number>`sum(${submission.isCorrect})` })
      .from(submission)
      .where(eq(submission.userId, userId)),
    db
      .selectDistinct({ date: sql<string>`date(${submission.createdAt})` })
      .from(submission)
      .where(eq(submission.userId, userId)),
  ])
  const total = Number(counts[0]?.total ?? 0)
  const correct = Number(counts[0]?.correct ?? 0)
  return ok(c, {
    solvedCount: Number(solved[0]?.count ?? 0),
    accuracy: total === 0 ? 0 : correct / total,
    streakDays: countStreakDays(dates.map((row) => row.date)),
  })
})

learning.get('/units/:unit_id', requireAuth, async (c) => {
  const detail = await getUnitDetail(c.get('userId'), c.req.param('unit_id'))
  return ok(c, detail)
})
