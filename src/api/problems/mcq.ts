import { Hono } from 'hono'
import { awardSolveExp } from '../../util/db/exp'
import { submissions } from '../../util/db/submissions'
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

export const mcqProblems = (await Bun.file('static/problems/mcq.json').json()) as McqProblem[]

// 조회할 때 정답(answer)은 빼고 내려준다
function toQuestion(p: McqProblem) {
  const { answer, ...content } = p.content
  return { id: p.id, type: p.type, title: p.title, reward: p.reward, content }
}

export const mcq = new Hono<AuthEnv>()

mcq.get('', requireAuth, (c) => {
  if (mcqProblems.length === 0) {
    return c.json({ message: '문제 풀이 비어있습니다' }, 404)
  }

  const problem = toQuestion(mcqProblems[Math.floor(Math.random() * mcqProblems.length)])
  return c.json({ problem }, 200)
})

mcq.post('', requireAuth, async (c) => {
  const body = await c.req.json()
  const { id, answer } = body
  const userId = c.get('userId')

  const problem = mcqProblems.find((problem) => problem.id === id)

  if (!problem) {
    return c.json({ message: '문제를 찾을 수 없습니다' }, 404)
  }

  const isAnswer = problem.content.answer === answer
  await submissions.create({ userId, problemId: id, isCorrect: isAnswer, answer })

  if (isAnswer) {
    await awardSolveExp(userId, problem.id, problem.reward)
    return c.json({ isAnswer }, 200)
  } else {
    return c.json({ answer: problem.content.answer }, 200)
  }
})
