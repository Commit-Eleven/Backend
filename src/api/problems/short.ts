import { Hono } from 'hono'
import { type AuthEnv, requireAuth } from '../../util/http/auth'

type McqProblem = {
  id: string
  type: 'mcq'
  title: string
  reward: number
  content: {
    choices: string[]
    answer: number
  }
}

export const mcqProblems = await Bun.file('static/problems/mcq.json').json() as McqProblem[]

export const mcq = new Hono<AuthEnv>()

mcq.get('', requireAuth, (c) => {
  if (mcqProblems.length === 0) {
    return c.json({ message: '문제 풀이 비어있습니다' }, 404)
  }

  const problem = mcqProblems[Math.floor(Math.random() * mcqProblems.length)]
  return c.json({ problem }, 200)
})

mcq.post('', requireAuth, async (c) => {
  const body = await c.req.json()
  const { id, answer } = body

  const problem = mcqProblems.find((problem) => problem.id === id)

  if (!problem) {
    return c.json({ message: "문제를 찾을 수 없습니다" }, 404)
  }

  const isAnswer = problem.content.answer === answer

  if (isAnswer) {
    return c.json({ isAnswer }, 200)

    // problem.reward를 사용자의 총 경험치에 추가할 것
  } else {
    return c.json({ answer: problem.content.answer }, 200)
  }
})