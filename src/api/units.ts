import { Hono } from 'hono'
import { submissions } from '../util/db/submissions'
import { type AuthEnv, requireAuth } from '../util/http/auth'
import { Errors, ok } from '../util/http/response'
import { findUnit, unitProgress } from '../util/learning'
import { blankProblems, toQuestion as blankQuestion } from './problems/blank'
import { codeProblems, toQuestion as codeQuestion } from './problems/code'
import { mcqProblems, toQuestion as mcqQuestion } from './problems/mcq'
import { parsonsProblems, toQuestion as parsonsQuestion } from './problems/parsons'
import { shortProblems, toQuestion as shortQuestion } from './problems/short'

export const units = new Hono<AuthEnv>()

// 문제 id → 화면에 내려줄 문제 (정답은 뺀 모양). 각 유형의 GET 과 같은 모양이다
const questionById = new Map<string, object>([
  ...mcqProblems.map((p) => [p.id, mcqQuestion(p)] as const),
  ...blankProblems.map((p) => [p.id, blankQuestion(p)] as const),
  ...parsonsProblems.map((p) => [p.id, parsonsQuestion(p)] as const),
  ...shortProblems.map((p) => [p.id, shortQuestion(p)] as const),
  ...codeProblems.map((p) => [p.id, codeQuestion(p)] as const),
])

// 단원 문제 전체를 커리큘럼 순서대로 한 번에 (정답 제외). 문제마다 내 풀이 상태(status)도 붙인다
units.get('/:unitId/problems', requireAuth, async (c) => {
  const found = findUnit(c.req.param('unitId'))
  if (!found) throw Errors.notFound('없는 단원')

  const solved = await submissions.solvedMapByUser(c.get('userId'))
  const progress = unitProgress(found.unit, solved)

  return ok(c, {
    unitId: found.unit.unitId,
    title: found.unit.title,
    courseTitle: found.course.title,
    total: progress.total,
    problems: progress.problems.map((p) => ({
      index: p.index,
      status: p.status,
      typeLabel: p.typeLabel,
      ...questionById.get(p.id),
    })),
  })
})

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
