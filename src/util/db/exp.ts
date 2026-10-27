import { eq, sql } from 'drizzle-orm'
import { db } from './connection'
import { expLog, user } from './schema'

// 정답으로 얻는 경험치. 문제당 1번만 지급한다. (uq_explog_solve)
export async function awardSolveExp(
  userId: number,
  problemId: string,
  amount: number,
): Promise<void> {
  try {
    await db.insert(expLog).values({ userId, problemId, amount, reason: 'solve' })
  } catch (err) {
    // 이미 푼 문제면 무시하고 총 경험치는 올리지 않는다
    if (!isDuplicateKey(err)) throw err
    return
  }

  await db
    .update(user)
    .set({ totalExp: sql`${user.totalExp} + ${amount}` })
    .where(eq(user.id, userId))
}

function isDuplicateKey(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ER_DUP_ENTRY'
  )
}
