import { Hono } from 'hono'
import { type AuthEnv, requireAuth } from '../../util/http/auth'

type ShortProblem = {
  id: string
  type: 'short'
  title: string
  reward: number
  content: {
    starter_code: string
    runtime: string
    time_limit_ms: number
    conditions: string[]
    testcases: { input: string; expected: string; visible?: boolean }[]
  }
}

export const shortProblems = (await Bun.file('static/problems/short.json').json()) as ShortProblem[]

export const short = new Hono<AuthEnv>()

short.get('', requireAuth, (c) => {
  if (shortProblems.length === 0) {
    return c.json({ message: '문제 풀이 비어있습니다' }, 404)
  }

  const problem = shortProblems[Math.floor(Math.random() * shortProblems.length)]
  return c.json({ problem }, 200)
})

short.post('', requireAuth, async (c) => {
  const body = await c.req.json()
  const { id, code } = body

  const problem = shortProblems.find((problem) => problem.id === id)

  if (!problem) {
    return c.json({ message: '문제를 찾을 수 없습니다' }, 404)
  }

  if (typeof code !== 'string') {
    return c.json({ message: '코드를 입력해주세요' }, 400)
  }

  const { passed, results } = await runCode({
    code,
    runtime: problem.content.runtime,
    timeLimitMs: problem.content.time_limit_ms,
    testcases: problem.content.testcases,
  })

  if (passed) {
    return c.json({ isAnswer: true }, 200)

    // problem.reward를 사용자의 총 경험치에 추가할 것
  } else {
    const visibleResults = results.filter((_, i) => problem.content.testcases[i]?.visible !== false)
    return c.json({ isAnswer: false, results: visibleResults }, 200)
  }
})
