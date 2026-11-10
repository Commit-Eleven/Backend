import { desc, eq, sql } from 'drizzle-orm'
import { db } from './connection'
import { expLog, user } from './schema'

export type ExpAward = { awarded: boolean; awardedExp: number }

// 정답으로 얻는 경험치. 문제당 1번만 지급한다. (uq_explog_solve)
// 기록 저장과 총 경험치 올리기를 한 트랜잭션으로 묶어서, 기록만 남고 경험치가 안 오르는 일이 없게 한다
export async function awardSolveExp(
  userId: number,
  problemId: string,
  amount: number,
): Promise<ExpAward> {
  try {
    await db.transaction(async (tx) => {
      await tx.insert(expLog).values({ userId, problemId, amount, reason: 'solve' })
      await tx
        .update(user)
        .set({ totalExp: sql`${user.totalExp} + ${amount}` })
        .where(eq(user.id, userId))
    })
  } catch (err) {
    // 이미 푼 문제면 경험치를 주지 않는다
    if (!isDuplicateKey(err)) throw err
    return { awarded: false, awardedExp: 0 }
  }
  return { awarded: true, awardedExp: amount }
}

// mysql2 오류가 그대로 오거나, drizzle 이 감싸서 cause 에 넣어 줄 수도 있다
function isDuplicateKey(err: unknown): boolean {
  const codeOf = (value: unknown) =>
    typeof value === 'object' && value !== null ? (value as { code?: unknown }).code : undefined
  const cause =
    typeof err === 'object' && err !== null ? (err as { cause?: unknown }).cause : undefined
  return codeOf(err) === 'ER_DUP_ENTRY' || codeOf(cause) === 'ER_DUP_ENTRY'
}

// 최근에 경험치를 얻은 기록. 최신순
export async function findRecentExp(userId: number, limit: number) {
  return db
    .select()
    .from(expLog)
    .where(eq(expLog.userId, userId))
    .orderBy(desc(expLog.id))
    .limit(limit)
}
