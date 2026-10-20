import { and, eq, inArray, like, ne } from 'drizzle-orm'
import type { STUDY_LEVEL } from '../config/constants'
import { SEARCH_RESULT_LIMIT } from '../config/constants'
import { db } from './connection'
import { user } from './schema'

export type UserRow = typeof user.$inferSelect
export type UserSummary = Pick<UserRow, 'id' | 'nickname' | 'tag' | 'totalExp'>

type NewUser = {
  email: string
  nickname: string
  tag: string
  providerId: string
}

export const users = {
  async findById(id: number): Promise<UserRow | undefined> {
    const rows = await db.select().from(user).where(eq(user.id, id))
    return rows[0]
  },

  async findByIds(ids: number[]): Promise<UserSummary[]> {
    if (ids.length === 0) return []
    return db
      .select({ id: user.id, nickname: user.nickname, tag: user.tag, totalExp: user.totalExp })
      .from(user)
      .where(inArray(user.id, ids))
  },

  async findByProviderId(providerId: string): Promise<UserRow | undefined> {
    const rows = await db.select().from(user).where(eq(user.providerId, providerId))
    return rows[0]
  },

  async existsByTag(tag: string): Promise<boolean> {
    const rows = await db.select({ id: user.id }).from(user).where(eq(user.tag, tag))
    return rows.length > 0
  },

  async create(data: NewUser): Promise<UserRow> {
    const [inserted] = await db.insert(user).values(data).$returningId()
    const rows = await db.select().from(user).where(eq(user.id, inserted.id))
    return rows[0]
  },

  async completeOnboarding(
    id: number,
    studyLanguage: string,
    studyLevel: (typeof STUDY_LEVEL)[number],
  ): Promise<void> {
    await db
      .update(user)
      .set({ studyLanguage, studyLevel, onboardedAt: new Date() })
      .where(eq(user.id, id))
  },

  async updateNickname(id: number, nickname: string, tag: string): Promise<void> {
    await db.update(user).set({ nickname, tag }).where(eq(user.id, id))
  },

  async search(
    query: string,
    excludeId: number,
    limit = SEARCH_RESULT_LIMIT,
  ): Promise<UserSummary[]> {
    return db
      .select({ id: user.id, nickname: user.nickname, tag: user.tag, totalExp: user.totalExp })
      .from(user)
      .where(and(like(user.nickname, `%${query}%`), ne(user.id, excludeId)))
      .limit(limit)
  },
}
