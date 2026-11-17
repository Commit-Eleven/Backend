import { Hono } from 'hono'
import { awardSolveExp } from '../../util/db/exp'
import { submissions } from '../../util/db/submissions'
import { users } from '../../util/db/users'
import { type AuthEnv, requireAuth } from '../../util/http/auth'
import { readJsonBody } from '../../util/http/body'
import { pickProblemId } from '../../util/learning'
import { excludeSolved, filterByLanguage } from '../../util/problems'

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

// id 를 주면 그 문제, 안 주면 language 로 거른 문제 중 커리큘럼·수준에 맞는 하나
parsons.get('', requireAuth, async (c) => {
  const requestedId = c.req.query('id')
  if (requestedId) {
    const found = parsonsProblems.find((problem) => problem.id === requestedId)
    if (!found) return c.json({ message: '문제를 찾을 수 없습니다' }, 404)
    return c.json({ problem: toQuestion(found) }, 200)
  }

  const language = c.req.query('language')
  const pool = filterByLanguage(parsonsProblems, language)
  if (pool.length === 0) {
    const message = language ? `${language} 문제가 아직 없습니다` : '문제 풀이 비어있습니다'
    return c.json({ message }, 404)
  }

  const userId = c.get('userId')
  const { unsolved, solved } = await excludeSolved(pool, userId)
  if (unsolved.length === 0) {
    const message = language ? `${language} 문제를 모두 풀었습니다` : '문제를 모두 풀었습니다'
    return c.json({ message }, 404)
  }

  const user = await users.findById(userId)
  const id = pickProblemId({ type: 'parsons', language, level: user?.studyLevel, solved })
  const problem = toQuestion(unsolved.find((p) => p.id === id) ?? unsolved[0])
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

  await submissions.create({
    userId: c.get('userId'),
    problemId: problem.id,
    isCorrect: isAnswer,
    answer,
  })

  if (isAnswer) {
    await awardSolveExp(c.get('userId'), problem.id, problem.reward)
    return c.json({ isAnswer }, 200)
  } else {
    return c.json({ isAnswer, answer: answerOrder }, 200)
  }
})
