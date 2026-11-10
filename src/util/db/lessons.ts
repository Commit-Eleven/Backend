import { and, eq, sql } from 'drizzle-orm'
import { db } from './connection'
import { lessonProgress } from './schema'

export type LessonRow = typeof lessonProgress.$inferSelect

export const lessons = {
  // 이미 완료한 레슨이면 그대로 두고 기존 기록을 돌려준다 (여러 번 보내도 안전)
  async complete(userId: number, lessonId: string, language: string): Promise<LessonRow> {
    await db
      .insert(lessonProgress)
      .values({ userId, lessonId, language })
      .onDuplicateKeyUpdate({ set: { lessonId: sql`${lessonProgress.lessonId}` } })

    const [row] = await db
      .select()
      .from(lessonProgress)
      .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.lessonId, lessonId)))
    return row
  },

  async listByUser(userId: number, language: string): Promise<LessonRow[]> {
    return db
      .select()
      .from(lessonProgress)
      .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.language, language)))
      .orderBy(lessonProgress.completedAt)
  },
}
