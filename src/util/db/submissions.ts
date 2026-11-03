import { and, desc, eq, gte, inArray, lt, notInArray, sql } from 'drizzle-orm'
import { db } from './connection'
import { submission } from './schema'

export type SubmissionRow = typeof submission.$inferSelect

type NewSubmission = {
  userId: number
  problemId: string
  isCorrect: boolean
  answer?: unknown
  runOutput?: string
}

export const submissions = {
  async create(data: NewSubmission): Promise<void> {
    await db.insert(submission).values({
      userId: data.userId,
      problemId: data.problemId,
      isCorrect: data.isCorrect,
      answer: data.answer,
      runOutput: data.runOutput,
    })
  },

  // 문제별로 맞힌 적 있는지. 제출한 문제만 들어 있다 (true 맞힘, false 틀리기만 함)
  async solvedMapByUser(userId: number): Promise<Map<string, boolean>> {
    const rows = await db
      .select({
        problemId: submission.problemId,
        solved: sql<number>`max(${submission.isCorrect})`,
      })
      .from(submission)
      .where(eq(submission.userId, userId))
      .groupBy(submission.problemId)

    return new Map(rows.map((row) => [row.problemId, Number(row.solved) === 1]))
  },

  // 연속 학습 계산용. since 이후 제출 시각
  async submittedAtSince(userId: number, since: Date): Promise<Date[]> {
    const rows = await db
      .select({ at: submission.createdAt })
      .from(submission)
      .where(and(eq(submission.userId, userId), gte(submission.createdAt, since)))

    return rows.map((row) => new Date(row.at))
  },

  // 맞춘 문제 id 목록(중복 제거)
  async findSolvedProblemIds(userId: number): Promise<string[]> {
    const rows = await db
      .selectDistinct({ problemId: submission.problemId })
      .from(submission)
      .where(and(eq(submission.userId, userId), eq(submission.isCorrect, true)))

    return rows.map((row) => row.problemId)
  },

  // 전체 제출 수와 맞은 제출 수
  async countByUser(userId: number): Promise<{ total: number; correct: number }> {
    const [total, correct] = await Promise.all([
      db.$count(submission, eq(submission.userId, userId)),
      db.$count(submission, and(eq(submission.userId, userId), eq(submission.isCorrect, true))),
    ])
    return { total, correct }
  },

  // id(≈제출 시각) 내림차순으로 최신 제출부터 최대 limit개 조회.
  // cursor를 주면 해당 id보다 오래된(작은 id) 제출만 가져온다.
  async findHistoryByUser(
    userId: number,
    opts: { cursor?: number; limit: number },
  ): Promise<SubmissionRow[]> {
    const where = opts.cursor
      ? and(eq(submission.userId, userId), lt(submission.id, opts.cursor))
      : eq(submission.userId, userId)

    return db.select().from(submission).where(where).orderBy(desc(submission.id)).limit(opts.limit)
  },

  // 오답노트용. 한 번이라도 맞춘 문제는 빼고, 문제별로 가장 최근에 틀린 제출 1건씩.
  // cursor를 주면 그 제출 id보다 오래된 것만 가져온다
  async findWrongNotesByUser(
    userId: number,
    opts: { cursor?: number; limit: number },
  ): Promise<SubmissionRow[]> {
    const solved = db
      .selectDistinct({ problemId: submission.problemId })
      .from(submission)
      .where(and(eq(submission.userId, userId), eq(submission.isCorrect, true)))

    const lastId = sql<number>`max(${submission.id})`
    const latest = await db
      .select({ lastId })
      .from(submission)
      .where(
        and(
          eq(submission.userId, userId),
          eq(submission.isCorrect, false),
          notInArray(submission.problemId, solved),
        ),
      )
      .groupBy(submission.problemId)
      .having(opts.cursor ? sql`${lastId} < ${opts.cursor}` : undefined)
      .orderBy(desc(lastId))
      .limit(opts.limit)

    const ids = latest.map((row) => Number(row.lastId))
    if (ids.length === 0) return []

    const rows = await db.select().from(submission).where(inArray(submission.id, ids))
    return rows.sort((a, b) => b.id - a.id)
  },
}
