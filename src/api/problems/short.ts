import { Hono } from 'hono'
import { awardSolveExp } from '../../util/db/exp'
import { submissions } from '../../util/db/submissions'
import { type AuthEnv, requireAuth } from '../../util/http/auth'

type ShortProblem = {
  id: string
  type: 'short'
  title: string
  reward: number
  content: {
    code: string
    answer: string[]
  }
}

export const shortProblems = (await Bun.file('static/problems/short.json').json()) as ShortProblem[]

// 조회할 때 정답(answer)은 빼고 내려준다
function toQuestion(p: ShortProblem) {
  const { answer, ...content } = p.content
  return { id: p.id, type: p.type, title: p.title, reward: p.reward, content }
}

export const short = new Hono<AuthEnv>()

short.get('', requireAuth, (c) => {
  if (shortProblems.length === 0) {
    return c.json({ message: '문제 풀이 비어있습니다' }, 404)
  }

  const problem = toQuestion(shortProblems[Math.floor(Math.random() * shortProblems.length)])
  return c.json({ problem }, 200)
})

short.post('', requireAuth, async (c) => {
  const body = await c.req.json()
  const { id, answer } = body

  const problem = shortProblems.find((problem) => problem.id === id)

  if (!problem) {
    return c.json({ message: '문제를 찾을 수 없습니다' }, 404)
  }

  if (typeof answer !== 'string') {
    return c.json({ message: '답을 입력해주세요' }, 400)
  }

  const userId = c.get('userId')
  const trimmed = answer.trim()
  const isAnswer = problem.content.answer.includes(trimmed)
  await submissions.create({ userId, problemId: id, isCorrect: isAnswer, answer: trimmed })

  if (isAnswer) {
    await awardSolveExp(userId, problem.id, problem.reward)
    return c.json({ isAnswer }, 200)
  } else {
    return c.json({ answer: problem.content.answer }, 200)
  }
})
