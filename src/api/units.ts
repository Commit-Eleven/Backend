import { Hono } from 'hono'
import { submissions } from '../util/db/submissions'
import { type AuthEnv, requireAuth } from '../util/http/auth'
import { Errors, ok } from '../util/http/response'
import { findUnit, unitProgress } from '../util/learning'

export const units = new Hono<AuthEnv>()

// 단원 상세. 단원 안 문제별 상태(correct / wrong / todo)와 다음 단원 잠금 여부
units.get('/:unitId', requireAuth, async (c) => {
  const found = findUnit(c.req.param('unitId'))
  if (!found) throw Errors.notFound('없는 단원')

  const solved = await submissions.solvedMapByUser(c.get('userId'))
  const progress = unitProgress(found.unit, solved)

  let nextUnit = null
  if (found.next) {
    const next = unitProgress(found.next.unit, solved)
    nextUnit = {
      unitId: found.next.unit.unitId,
      title: found.next.unit.title,
      order: found.next.unit.order,
      total: next.total,
      solved: next.solved,
      completePercent: next.completePercent,
      // 다음 단원은 지금 단원을 100% 풀어야 열린다
      unlocked: progress.completePercent === 100,
    }
  }

  return ok(c, {
    unitId: found.unit.unitId,
    title: found.unit.title,
    courseTitle: found.course.title,
    completePercent: progress.completePercent,
    solved: progress.solved,
    wrong: progress.wrong,
    remaining: progress.remaining,
    problems: progress.problems.map(({ reward, ...problem }) => problem),
    nextUnit,
  })
})
