import { Hono } from 'hono'
import { RANKING_PAGE_SIZE, RANKING_PAGE_SIZE_MAX } from '../util/config/constants'
import { users } from '../util/db/users'
import { type AuthEnv, requireAuth } from '../util/http/auth'
import { Errors, ok } from '../util/http/response'

export const ranking = new Hono<AuthEnv>()

const positiveInt = (raw: string | undefined, fallback: number) => {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : fallback
}

// 전체 경험치 랭킹. page 는 1부터. 내 순위(me)도 같이 준다
ranking.get('', requireAuth, async (c) => {
  const page = positiveInt(c.req.query('page'), 1)
  const size = Math.min(positiveInt(c.req.query('size'), RANKING_PAGE_SIZE), RANKING_PAGE_SIZE_MAX)

  const me = await users.findById(c.get('userId'))
  if (!me) throw Errors.notFound('없는 사용자')

  const [rows, total, myRank] = await Promise.all([
    users.ranking((page - 1) * size, size),
    users.count(),
    users.rankOf(me.totalExp),
  ])

  return ok(c, {
    items: rows.map((row) => ({
      rank: Number(row.rank),
      userId: row.id,
      nickname: row.nickname,
      tag: row.tag,
      totalExp: row.totalExp,
    })),
    page,
    size,
    total,
    me: { rank: myRank, userId: me.id, totalExp: me.totalExp },
  })
})
