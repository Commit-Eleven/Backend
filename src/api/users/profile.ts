import { and, eq, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '../../util/db/connection'
import { friend } from '../../util/db/schema'
import { submissions } from '../../util/db/submissions'
import { users } from '../../util/db/users'
import { type AuthEnv, requireAuth } from '../../util/http/auth'
import { Errors, ok } from '../../util/http/response'

export const profile = new Hono<AuthEnv>()

// 다른 유저 프로필. 숫자 id만 받아서 /api/users/me 같은 다른 경로와 안 겹치게 한다
profile.get('/:id{[0-9]+}', requireAuth, async (c) => {
  const myId = c.get('userId')
  const targetId = Number(c.req.param('id'))

  const target = await users.findById(targetId)
  if (!target) throw Errors.notFound('없는 사용자')

  const solvedIds = await submissions.findSolvedProblemIds(targetId)

  // 나와 이 사람의 친구 관계. 신청한 쪽이 누구든 한 줄만 있다
  const [f] = await db
    .select()
    .from(friend)
    .where(
      or(
        and(eq(friend.requesterId, myId), eq(friend.addresseeId, targetId)),
        and(eq(friend.requesterId, targetId), eq(friend.addresseeId, myId)),
      ),
    )

  // 이메일, 구글 id 같은 개인정보는 내려주지 않는다
  return ok(c, {
    id: target.id,
    nickname: target.nickname,
    tag: target.tag,
    tier: target.tier,
    totalExp: target.totalExp,
    studyLanguage: target.studyLanguage,
    solvedProblemCount: solvedIds.length,
    isMe: target.id === myId,
    friendship: f
      ? {
          friendshipId: f.id,
          status: f.status,
          direction: f.requesterId === myId ? ('outgoing' as const) : ('incoming' as const),
        }
      : null,
  })
})
