import { findUnit, nextUnitOf, type Unit } from '../lib/curriculum'
import { Errors } from '../lib/errors'
import { getProblemSummary } from '../lib/problems'
import type { LatestSubmission, SubmissionCounts } from '../repositories/submissionRepository'
import { submissionRepository } from '../repositories/submissionRepository'

// 서비스가 실제로 필요로 하는 최소 모양만 요구한다.
// 그래야 테스트에서 진짜 DB 로우와 무관한 fake를 그대로 넣을 수 있다.
type SubmissionRepo = {
  countTotalAndCorrect(userId: number): Promise<SubmissionCounts>
  countDistinctCorrectProblems(userId: number): Promise<number>
  listSubmissionDates(userId: number): Promise<string[]>
  latestByProblemIds(userId: number, problemIds: string[]): Promise<LatestSubmission[]>
}

type ProblemStatus = 'correct' | 'wrong' | 'todo'

function completePercentOf(solved: number, total: number): number {
  return total === 0 ? 0 : Math.round((solved / total) * 100)
}

/** submission.created_at의 날짜들이 오늘부터 며칠 연속인지 (테이블 명세서 16장) */
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

export function createLearningService(repo: SubmissionRepo) {
  async function getStats(userId: number) {
    const [solvedCount, { total, correct }, submissionDates] = await Promise.all([
      repo.countDistinctCorrectProblems(userId),
      repo.countTotalAndCorrect(userId),
      repo.listSubmissionDates(userId),
    ])

    return {
      solvedCount,
      accuracy: total === 0 ? 0 : correct / total,
      streakDays: countStreakDays(submissionDates),
    }
  }

  // 커리큘럼 조회 API(/curriculum)와 같은 단원 요약 모양. nextUnit에도 그대로 쓴다.
  async function summarizeUnit(userId: number, unit: Unit, unlocked: boolean) {
    const latest = await repo.latestByProblemIds(userId, unit.problemIds)
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

    const latest = await repo.latestByProblemIds(userId, unit.problemIds)
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
    const next = nextUnitOf(course, unit)
    // 다음 단원 잠금 해제 조건(테이블 명세서 15.2): 직전 단원 완료율 100%
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

  return { getStats, getUnitDetail }
}

export const learningService = createLearningService(submissionRepository)
