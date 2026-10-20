import { Hono } from 'hono'
import { type AuthEnv, requireAuth } from '../../util/http/auth'

type BlankProblem = {
  id: string
  type: 'blank'
  title: string
  reward: number
  content: {
    choices: string[]
    answer: number
  }
}

export const blankProblems = await Bun.file('static/problems/blank.json').json() as BlankProblem[]

export const blank = new Hono<AuthEnv>()

blank.get('', requireAuth, (c) => {
  if (blankProblems.length === 0) {
    return c.json({ message: '문제 풀이 비어있습니다' }, 404)
  }

  const problem = blankProblems[Math.floor(Math.random() * blankProblems.length)]
  return c.json({ problem }, 200)
})

blank.post('', requireAuth, async (c) => {
  const body = await c.req.json()
  const { id, answer } = body

  const problem = blankProblems.find((problem) => problem.id === id)

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