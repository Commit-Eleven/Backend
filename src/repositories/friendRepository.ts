import { and, eq, or } from 'drizzle-orm'
import type { FriendStatus } from '../constants'
import { db } from '../db'
import { friend } from '../db/schema'

export type FriendRow = typeof friend.$inferSelect

export const friendRepository = {
  async findById(id: number): Promise<FriendRow | undefined> {
    const rows = await db.select().from(friend).where(eq(friend.id, id))
    return rows[0]
  },

  /** a<->b 사이 관계, 방향 무관 */
  async findBetween(a: number, b: number): Promise<FriendRow | undefined> {
    const rows = await db
      .select()
      .from(friend)
      .where(
        or(
          and(eq(friend.requesterId, a), eq(friend.addresseeId, b)),
          and(eq(friend.requesterId, b), eq(friend.addresseeId, a)),
        ),
      )
    return rows[0]
  },

  async listByUser(userId: number): Promise<FriendRow[]> {
    return db
      .select()
      .from(friend)
      .where(or(eq(friend.requesterId, userId), eq(friend.addresseeId, userId)))
  },

  async create(requesterId: number, addresseeId: number): Promise<FriendRow> {
    const [inserted] = await db.insert(friend).values({ requesterId, addresseeId }).$returningId()
    const rows = await db.select().from(friend).where(eq(friend.id, inserted.id))
    return rows[0]
  },

  async updateStatus(id: number, status: FriendStatus, respondedAt: Date): Promise<void> {
    await db.update(friend).set({ status, respondedAt }).where(eq(friend.id, id))
  },

  async remove(id: number): Promise<void> {
    await db.delete(friend).where(eq(friend.id, id))
  },
}
