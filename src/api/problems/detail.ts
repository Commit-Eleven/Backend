import { Hono } from 'hono'
import { type AuthEnv, requireAuth } from '../../util/http/auth'
import { blankProblems, toQuestion as blankQuestion } from './blank'
import { codeProblems, toQuestion as codeQuestion } from './code'
import { mcqProblems, toQuestion as mcqQuestion } from './mcq'
import { parsonsProblems, toQuestion as parsonsQuestion } from './parsons'
import { shortProblems, toQuestion as shortQuestion } from './short'

function lookup<T extends { id: string }>(list: T[], toQuestion: (problem: T) => unknown) {
  return (id: string) => {
    const found = list.find((problem) => problem.id === id)
    return found ? toQuestion(found) : undefined
  }
}

const lookups = [
  lookup(mcqProblems, mcqQuestion),
  lookup(blankProblems, blankQuestion),
  lookup(parsonsProblems, parsonsQuestion),
  lookup(shortProblems, shortQuestion),
  lookup(codeProblems, codeQuestion),
]

export const problemDetail = new Hono<AuthEnv>()

// 유형을 몰라도 문제 id 하나로 본문을 가져온다. 응답은 유형별 조회와 같다
problemDetail.get('/:id', requireAuth, (c) => {
  const id = c.req.param('id')
  for (const find of lookups) {
    const problem = find(id)
    if (problem) return c.json({ problem }, 200)
  }
  return c.json({ message: '문제를 찾을 수 없습니다' }, 404)
})
