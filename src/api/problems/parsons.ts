import { Hono } from 'hono'
import { awardSolveExp } from '../../util/db/exp'
import { submissions } from '../../util/db/submissions'
import { type AuthEnv, requireAuth } from '../../util/http/auth'
import { readJsonBody } from '../../util/http/body'
import { filterByLanguage } from '../../util/problems'

type ParsonsProblem = {
  id: string
  type: 'parsons'
  title: string
  reward: number
  description?: string
  language?: string
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
  return {
    id: p.id,
    type: p.type,
    title: p.title,
    description: p.description,
    reward: p.reward,
    content,
  }
}

export const parsons = new Hono<AuthEnv>()

parsons.get('', requireAuth, (c) => {
  const language = c.req.query('language')
  const pool = filterByLanguage(parsonsProblems, language)
  if (pool.length === 0) {
    const message = language ? `${language} 문제가 아직 없습니다` : '문제 풀이 비어있습니다'
    return c.json({ message }, 404)
  }

  const problem = toQuestion(pool[Math.floor(Math.random() * pool.length)])
  return c.json({ problem }, 200)
})

parsons.post('', requireAuth, async (c) => {
  const body = await readJsonBody(c)
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

  await submissions.create({ userId: c.get('userId'), problemId: problem.id, isCorrect: isAnswer, answer })

  if (isAnswer) {
    await awardSolveExp(c.get('userId'), problem.id, problem.reward)
    return c.json({ isAnswer }, 200)
  } else {
    return c.json({ isAnswer, answer: answerOrder }, 200)
  }
})
