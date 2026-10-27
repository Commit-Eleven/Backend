import { Hono } from 'hono'
import { awardSolveExp } from '../../util/db/exp'
import { submissions } from '../../util/db/submissions'
import { type AuthEnv, requireAuth } from '../../util/http/auth'

type ParsonsProblem = {
  id: string
  type: 'parsons'
  title: string
  reward: number
  content: {
    fragments: string[]
    answer_order: number[]
  }
}

export const parsonsProblems = (await Bun.file(
  'static/problems/parsons.json',
).json()) as ParsonsProblem[]

// 조회할 때 정답 순서(answer_order)는 빼고 내려준다
function toQuestion(p: ParsonsProblem) {
  const { answer_order, ...content } = p.content
  return { id: p.id, type: p.type, title: p.title, reward: p.reward, content }
}

export const parsons = new Hono<AuthEnv>()

parsons.get('', requireAuth, (c) => {
  if (parsonsProblems.length === 0) {
    return c.json({ message: '문제 풀이 비어있습니다' }, 404)
  }

  const problem = toQuestion(parsonsProblems[Math.floor(Math.random() * parsonsProblems.length)])
  return c.json({ problem }, 200)
})

parsons.post('', requireAuth, async (c) => {
  const body = await c.req.json()
  const { id, answer } = body

  const problem = parsonsProblems.find((problem) => problem.id === id)

  if (!problem) {
    return c.json({ message: '문제를 찾을 수 없습니다' }, 404)
  }

  const { fragments, answer_order: answerOrder } = problem.content

  let isAnswer = false
  if (Array.isArray(answer) && answer.length === answerOrder.length) {
    if (answer.every((item) => typeof item === 'number')) {
      isAnswer = answer.every((index, i) => index === answerOrder[i])
    } else if (answer.every((item) => typeof item === 'string')) {
      isAnswer = answer.every((fragment, i) => fragment === fragments[answerOrder[i]])
    }
  }

  await submissions.create({ userId: c.get('userId'), problemId: id, isCorrect: isAnswer, answer })

  if (isAnswer) {
    await awardSolveExp(c.get('userId'), problem.id, problem.reward)
    return c.json({ isAnswer }, 200)
  } else {
    return c.json({ answer: answerOrder }, 200)
  }
})
