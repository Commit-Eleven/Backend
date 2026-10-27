import { Hono } from 'hono'
import { awardSolveExp } from '../../util/db/exp'
import { submissions } from '../../util/db/submissions'
import { type AuthEnv, requireAuth } from '../../util/http/auth'

type BlankProblem = {
  id: string
  type: 'blank'
  title: string
  reward: number
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
    reward: p.reward,
    content: { ...p.content, blanks },
  }
}

export const blank = new Hono<AuthEnv>()

blank.get('', requireAuth, (c) => {
  if (blankProblems.length === 0) {
    return c.json({ message: '문제 풀이 비어있습니다' }, 404)
  }

  const problem = toQuestion(blankProblems[Math.floor(Math.random() * blankProblems.length)])
  return c.json({ problem }, 200)
})

function submittedByNo(answer: unknown, blanks: { no: number }[]): Record<number, string> {
  const map = Object.fromEntries(blanks.map((blank) => [blank.no, ''])) as Record<number, string>

  if (Array.isArray(answer)) {
    blanks.forEach((blank, i) => {
      if (typeof answer[i] === 'string') map[blank.no] = answer[i]
    })
  } else if (answer && typeof answer === 'object') {
    blanks.forEach((blank) => {
      const value = (answer as Record<string, unknown>)[String(blank.no)]
      if (typeof value === 'string') map[blank.no] = value
    })
  }

  return map
}

blank.post('', requireAuth, async (c) => {
  const body = await c.req.json()
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
    return c.json({ answer: problem.content.blanks }, 200)
  }
})
