import { Hono } from 'hono'
import { awardSolveExp } from '../../util/db/exp'
import { submissions } from '../../util/db/submissions'
import { type AuthEnv, requireAuth } from '../../util/http/auth'
import { filterByLanguage } from '../../util/problems'

type BlankProblem = {
  id: string
  type: 'blank'
  title: string
  reward: number
  description?: string
  language?: string
  content: {
    template: string
    blanks: { no: number; answer: string[]; hint?: string }[]
  }
}

export const blankProblems = (await Bun.file('static/problems/blank.json').json()) as BlankProblem[]

// 조회할 때 빈칸 답안은 빼고 내려준다
function toQuestion(p: BlankProblem) {
  const blanks = p.content.blanks.map(({ answer, ...blank }) => blank)
  return {
    id: p.id,
    type: p.type,
    title: p.title,
    description: p.description,
    reward: p.reward,
    content: { ...p.content, blanks },
  }
}

export const blank = new Hono<AuthEnv>()

blank.get('', requireAuth, (c) => {
  const language = c.req.query('language')
  const pool = filterByLanguage(blankProblems, language)
  if (pool.length === 0) {
    const message = language ? `${language} 문제가 아직 없습니다` : '문제 풀이 비어있습니다'
    return c.json({ message }, 404)
  }

  const problem = toQuestion(pool[Math.floor(Math.random() * pool.length)])
  return c.json({ problem }, 200)
})

function submittedByNo(answer: unknown, blanks: { no: number }[]): Record<number, string> {
  const map = Object.fromEntries(blanks.map((blank) => [blank.no, ''])) as Record<number, string>

  // 프론트는 빈칸 답을 문자열 하나로 보낸다. 빈칸이 여러 개면 쉼표로 나눠서 순서대로 넣는다
  if (typeof answer === 'string') {
    const parts = blanks.length === 1 ? [answer] : answer.split(',')
    blanks.forEach((blank, i) => {
      if (parts[i] !== undefined) map[blank.no] = parts[i]
    })
  } else if (Array.isArray(answer)) {
    blanks.forEach((blank, i) => {
      if (typeof answer[i] === 'string' || typeof answer[i] === 'number') {
        map[blank.no] = String(answer[i])
      }
    })
  } else if (answer && typeof answer === 'object') {
    blanks.forEach((blank) => {
      const value = (answer as Record<string, unknown>)[String(blank.no)]
      if (typeof value === 'string' || typeof value === 'number') map[blank.no] = String(value)
    })
  }

  return map
}

blank.post('', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { id, answer } = body

  const problem = blankProblems.find((problem) => problem.id === id)

  if (!problem) {
    return c.json({ message: '문제를 찾을 수 없습니다' }, 404)
  }

  const submitted = submittedByNo(answer, problem.content.blanks)
  const isAnswer = problem.content.blanks.every((blank) =>
    blank.answer.includes(submitted[blank.no].trim()),
  )
  await submissions.create({
    userId: c.get('userId'),
    problemId: id,
    isCorrect: isAnswer,
    answer: submitted,
  })

  if (isAnswer) {
    await awardSolveExp(c.get('userId'), problem.id, problem.reward)
    return c.json({ isAnswer }, 200)
  } else {
    // 프론트는 정답을 answers 로 읽어서 같은 값을 answers 로도 준다
    const answer = problem.content.blanks.map((blank) => ({ ...blank, answers: blank.answer }))
    return c.json({ isAnswer, answer }, 200)
  }
})
