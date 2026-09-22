import { describe, expect, test } from 'bun:test'
import { createLearningService } from '../src/services/learningService'

function todayMinusDays(n: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function makeFakeRepo(opts: {
  solvedCount?: number
  counts?: { total: number; correct: number }
  submissionDates?: string[]
  latest?: { problemId: string; isCorrect: boolean }[]
}) {
  return {
    async countDistinctCorrectProblems() {
      return opts.solvedCount ?? 0
    },
    async countTotalAndCorrect() {
      return opts.counts ?? { total: 0, correct: 0 }
    },
    async listSubmissionDates() {
      return opts.submissionDates ?? []
    },
    async latestByProblemIds() {
      return opts.latest ?? []
    },
  }
}

describe('getStats', () => {
  test('제출 없으면 정답률 0, 연속일 0', async () => {
    const service = createLearningService(makeFakeRepo({}))
    const stats = await service.getStats(1)
    expect(stats).toEqual({ solvedCount: 0, accuracy: 0, streakDays: 0 })
  })

  test('정답률은 정답 수 / 전체 제출 수', async () => {
    const service = createLearningService(
      makeFakeRepo({ solvedCount: 3, counts: { total: 4, correct: 3 } }),
    )
    const stats = await service.getStats(1)
    expect(stats.solvedCount).toBe(3)
    expect(stats.accuracy).toBe(0.75)
  })

  test('오늘 포함 연속 제출일수를 센다', async () => {
    const dates = [todayMinusDays(0), todayMinusDays(1), todayMinusDays(2), todayMinusDays(5)]
    const service = createLearningService(makeFakeRepo({ submissionDates: dates }))
    const stats = await service.getStats(1)
    expect(stats.streakDays).toBe(3)
  })

  test('오늘 제출이 없으면 연속일 0', async () => {
    const dates = [todayMinusDays(1), todayMinusDays(2)]
    const service = createLearningService(makeFakeRepo({ submissionDates: dates }))
    const stats = await service.getStats(1)
    expect(stats.streakDays).toBe(0)
  })
})

describe('getUnitDetail', () => {
  test('없는 단원이면 에러', async () => {
    const service = createLearningService(makeFakeRepo({}))
    await expect(service.getUnitDetail(1, '없는단원')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  test('맞춘/틀린/안푼 문제를 구분해서 진행률을 계산한다', async () => {
    const service = createLearningService(
      makeFakeRepo({
        latest: [
          { problemId: 'fill_blank-001', isCorrect: true },
          { problemId: 'fill_blank-002', isCorrect: false },
        ],
      }),
    )
    const detail = await service.getUnitDetail(1, 'vars-types')

    expect(detail.unitId).toBe('vars-types')
    expect(detail.problems).toHaveLength(10)
    expect(detail.solved).toBe(1)
    expect(detail.wrong).toBe(1)
    expect(detail.remaining).toBe(8)
    expect(detail.completePercent).toBe(10)
    expect(detail.nextUnit).toEqual({ unitId: 'conditionals', title: '조건문' })
  })

  test('마지막 단원이면 nextUnit은 null', async () => {
    const service = createLearningService(makeFakeRepo({}))
    const detail = await service.getUnitDetail(1, 'conditionals')
    expect(detail.nextUnit).toBeNull()
  })
})
