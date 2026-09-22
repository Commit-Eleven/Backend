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

  async remove(id: number): Promise<void> {
    await db.delete(refreshToken).where(eq(refreshToken.id, id))
  },

  async removeAllByUser(userId: number): Promise<void> {
    await db.delete(refreshToken).where(eq(refreshToken.userId, userId))
  },
}
