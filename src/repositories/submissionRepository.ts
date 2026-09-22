import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../db'
import { submission } from '../db/schema'

export type SubmissionCounts = { total: number; correct: number }
export type LatestSubmission = { problemId: string; isCorrect: boolean }

export const submissionRepository = {
  async countTotalAndCorrect(userId: number): Promise<SubmissionCounts> {
    const rows = await db
      .select({
        total: sql<number>`count(*)`,
        correct: sql<number>`sum(${submission.isCorrect})`,
      })
      .from(submission)
      .where(eq(submission.userId, userId))
    return { total: Number(rows[0]?.total ?? 0), correct: Number(rows[0]?.correct ?? 0) }
  },

  async countDistinctCorrectProblems(userId: number): Promise<number> {
    const rows = await db
      .select({ count: sql<number>`count(distinct ${submission.problemId})` })
      .from(submission)
      .where(and(eq(submission.userId, userId), eq(submission.isCorrect, true)))
    return Number(rows[0]?.count ?? 0)
  },

  async listSubmissionDates(userId: number): Promise<string[]> {
    const rows = await db
      .selectDistinct({ date: sql<string>`date(${submission.createdAt})` })
      .from(submission)
      .where(eq(submission.userId, userId))
    return rows.map((r) => r.date)
  },

  /** 문제별 최신 제출만 */
  async latestByProblemIds(userId: number, problemIds: string[]): Promise<LatestSubmission[]> {
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
  },
}
