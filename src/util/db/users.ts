import { and, asc, desc, eq, gt, inArray, like, ne, sql } from 'drizzle-orm'
import type { PROFILE_VISIBILITY, STUDY_LANGUAGE, STUDY_LEVEL } from '../config/constants'
import { SEARCH_RESULT_LIMIT } from '../config/constants'
import { db } from './connection'
import { groupMember, studyGroup, user } from './schema'

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

  // Public projection intentionally excludes email and providerId.
  async findPublicProfileById(id: number): Promise<UserSummary | undefined> {
    const rows = await db
      .select({ id: user.id, nickname: user.nickname, tag: user.tag, totalExp: user.totalExp })
      .from(user)
      .where(eq(user.id, id))
      .limit(1)
    return rows[0]
  },

  // 경험치 랭킹. 경험치가 같으면 같은 순위 (1, 1, 3 ...)
  async ranking(offset: number, limit: number) {
    return db
      .select({
        rank: sql<number>`rank() over (order by ${user.totalExp} desc)`,
        id: user.id,
        nickname: user.nickname,
        tag: user.tag,
        totalExp: user.totalExp,
      })
      .from(user)
      .orderBy(desc(user.totalExp), asc(user.id))
      .limit(limit)
      .offset(offset)
  },

  async count(): Promise<number> {
    return db.$count(user)
  },

  // 내 순위 = 나보다 경험치 많은 사람 수 + 1
  async rankOf(totalExp: number): Promise<number> {
    return (await db.$count(user, gt(user.totalExp, totalExp))) + 1
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

  async updateStudyLanguage(
    id: number,
    studyLanguage: (typeof STUDY_LANGUAGE)[number],
  ): Promise<void> {
    await db.update(user).set({ studyLanguage }).where(eq(user.id, id))
  },

  // 학습설정 변경. 넘어온 값만 바꾼다
  async updateLearning(
    id: number,
    data: {
      studyLanguage?: (typeof STUDY_LANGUAGE)[number]
      studyLevel?: (typeof STUDY_LEVEL)[number]
    },
  ): Promise<void> {
    await db.update(user).set(data).where(eq(user.id, id))
  },

  // 내가 방장인 그룹 중 다른 멤버가 남아 있는 그룹. 탈퇴 전에 방장을 넘겨야 하는 그룹이다
  async ownedGroupsWithOtherMembers(userId: number) {
    const members = sql<number>`count(${groupMember.userId})`
    const rows = await db
      .select({ id: studyGroup.id, name: studyGroup.name, memberCount: members })
      .from(studyGroup)
      .leftJoin(groupMember, eq(groupMember.groupId, studyGroup.id))
      .where(eq(studyGroup.ownerId, userId))
      .groupBy(studyGroup.id, studyGroup.name)
      .having(sql`${members} > 1`)
      .orderBy(asc(studyGroup.id))
    return rows.map((row) => ({ ...row, memberCount: Number(row.memberCount) }))
  },

  // 계정 삭제. 제출 기록, 경험치, 친구, 알림, 토큰, 혼자 남은 내 그룹은 FK cascade 로 같이 지워진다
  async remove(id: number): Promise<void> {
    await db.delete(user).where(eq(user.id, id))
  },

  async findProfileVisibility(
    id: number,
  ): Promise<(typeof PROFILE_VISIBILITY)[number] | undefined> {
    const [row] = await db
      .select({ profileVisibility: user.profileVisibility })
      .from(user)
      .where(eq(user.id, id))
    return row?.profileVisibility
  },

  // 개인정보 설정. 넘어온 값만 바꾼다
  async updatePrivacy(
    id: number,
    data: {
      allowFriendRequests?: boolean
      profileVisibility?: (typeof PROFILE_VISIBILITY)[number]
    },
  ): Promise<void> {
    await db.update(user).set(data).where(eq(user.id, id))
  },

  async updateNickname(id: number, nickname: string, tag: string): Promise<void> {
    await db.update(user).set({ nickname, tag }).where(eq(user.id, id))
  },

  async search(
    query: string,
    excludeId: number,
    limit = SEARCH_RESULT_LIMIT,
  ): Promise<UserSummary[]> {
    const exactMatch = query.match(/^(.+)#(\d{4})$/)
    const condition = exactMatch
      ? and(
          eq(user.nickname, exactMatch[1].trim()),
          eq(user.tag, exactMatch[2]),
          ne(user.id, excludeId),
        )
      : and(like(user.nickname, `%${query}%`), ne(user.id, excludeId))

    return db
      .select({ id: user.id, nickname: user.nickname, tag: user.tag, totalExp: user.totalExp })
      .from(user)
      .where(condition)
      .limit(limit)
  },
}
