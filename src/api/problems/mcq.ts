import { Hono } from 'hono'
import { awardSolveExp } from '../../util/db/exp'
import { submissions } from '../../util/db/submissions'
import { type AuthEnv, requireAuth } from '../../util/http/auth'

type McqProblem = {
  id: string
  type: 'mcq'
  title: string
  reward: number
  description?: string
  content: {
    choices: string[]
    answer: number
  }
}

export const mcqProblems = (await Bun.file('static/problems/mcq.json').json()) as McqProblem[]

// 조회할 때 정답(answer)은 빼고 내려준다
function toQuestion(p: McqProblem) {
  const { answer, ...content } = p.content
  return {
    id: p.id,
    type: p.type,
    title: p.title,
    description: p.description,
    reward: p.reward,
    content,
  }
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
  const body = await c.req.json().catch(() => ({}))
  const { id, answer } = body
  const userId = c.get('userId')

  const problem = mcqProblems.find((problem) => problem.id === id)

  if (!problem) {
    return c.json({ message: '문제를 찾을 수 없습니다' }, 404)
  }

  // answer 는 보기 배열의 번호라 0부터 센다. "1" 처럼 글자로 와도 숫자로 본다
  const picked = typeof answer === 'string' && /^\d+$/.test(answer.trim()) ? Number(answer) : answer
  const isAnswer = problem.content.answer === picked
  await submissions.create({ userId, problemId: id, isCorrect: isAnswer, answer: picked })

  if (isAnswer) {
    await awardSolveExp(userId, problem.id, problem.reward)
    return c.json({ isAnswer }, 200)
  } else {
    const { answer: correct, choices } = problem.content
    return c.json({ isAnswer, answer: correct, answerText: choices[correct] }, 200)
  }
})
