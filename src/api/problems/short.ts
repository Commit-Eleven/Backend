import { Hono } from 'hono'
import { awardSolveExp } from '../../util/db/exp'
import { submissions } from '../../util/db/submissions'
import { type AuthEnv, requireAuth } from '../../util/http/auth'
import { filterByLanguage } from '../../util/problems'

type ShortProblem = {
  id: string
  type: 'short'
  title: string
  reward: number
  description?: string
  language?: string
  content: {
    code: string
    answer: string[]
  }
}

export const shortProblems = (await Bun.file('static/problems/short.json').json()) as ShortProblem[]

// 조회할 때 정답(answer)은 빼고 내려준다
function toQuestion(p: ShortProblem) {
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

export const short = new Hono<AuthEnv>()

short.get('', requireAuth, (c) => {
  const language = c.req.query('language')
  const pool = filterByLanguage(shortProblems, language)
  if (pool.length === 0) {
    const message = language ? `${language} 문제가 아직 없습니다` : '문제 풀이 비어있습니다'
    return c.json({ message }, 404)
  }

  const problem = toQuestion(pool[Math.floor(Math.random() * pool.length)])
  return c.json({ problem }, 200)
})

short.post('', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { id } = body
  // 출력값이 숫자라 20 처럼 숫자로 보내도 글자로 바꿔서 비교한다
  const answer = typeof body.answer === 'number' ? String(body.answer) : body.answer

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
    // 프론트는 answer 를 문자열 하나로 보여 준다. 인정되는 답 전체는 answers 로
    return c.json(
      { isAnswer, answer: problem.content.answer[0], answers: problem.content.answer },
      200,
    )
  }
})
