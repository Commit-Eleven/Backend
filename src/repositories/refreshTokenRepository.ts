import { eq } from 'drizzle-orm'
import { db } from '../db'
import { refreshToken } from '../db/schema'

export type RefreshTokenRow = typeof refreshToken.$inferSelect

export const refreshTokenRepository = {
  async create(userId: number, tokenHash: string, expiresAt: Date): Promise<void> {
    await db.insert(refreshToken).values({ userId, tokenHash, expiresAt })
  },

  async findByHash(tokenHash: string): Promise<RefreshTokenRow | undefined> {
    const rows = await db.select().from(refreshToken).where(eq(refreshToken.tokenHash, tokenHash))
    return rows[0]
  },

  // 실제로 지웠으면 true. 동시 요청이 먼저 지웠으면 false
  async remove(id: number): Promise<boolean> {
    const [res] = await db.delete(refreshToken).where(eq(refreshToken.id, id))
    return res.affectedRows > 0
  },

  async removeAllByUser(userId: number): Promise<void> {
    await db.delete(refreshToken).where(eq(refreshToken.userId, userId))
  },
}
