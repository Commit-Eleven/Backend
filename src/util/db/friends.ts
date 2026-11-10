import { and, eq, or } from 'drizzle-orm'
import { db } from './connection'
import { friend } from './schema'

export const friendships = {
  // 서로 수락된 친구인지
  async areFriends(a: number, b: number): Promise<boolean> {
    const [row] = await db
      .select({ id: friend.id })
      .from(friend)
      .where(
        and(
          eq(friend.status, 'accepted'),
          or(
            and(eq(friend.requesterId, a), eq(friend.addresseeId, b)),
            and(eq(friend.requesterId, b), eq(friend.addresseeId, a)),
          ),
        ),
      )
      .limit(1)
    return row !== undefined
  },
}
