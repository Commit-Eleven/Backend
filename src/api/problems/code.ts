import { Hono } from 'hono'
import { awardSolveExp } from '../../util/db/exp'
import { submissions } from '../../util/db/submissions'
import { users } from '../../util/db/users'
import { type AuthEnv, requireAuth } from '../../util/http/auth'
import { readJsonBody } from '../../util/http/body'
import { pickProblemId } from '../../util/learning'
import { excludeSolved, filterByLanguage } from '../../util/problems'

type CodeCheck = { pattern: string; flags?: string; message: string }

type CodeProblem = {
  id: string
  type: 'code'
  title: string
  reward: number
  description?: string
  language?: string
  content: {
    starter_code: string
    checks: CodeCheck[]
  }
}

// 사용자 코드는 실행하지 않고, 문제마다 정해 둔 규칙(정규식)에 맞는지만 본다
export const codeProblems = (await Bun.file('static/problems/code.json').json()) as CodeProblem[]
const compiled = new Map(
  codeProblems.map((p) => [
    p.id,
    p.content.checks.map((check) => ({ ...check, regex: new RegExp(check.pattern, check.flags) })),
  ]),
)

const MAX_CODE_LENGTH = 10_000

// 조회할 때 채점 규칙(checks)은 빼고 내려준다
function toQuestion(p: CodeProblem) {
  return {
    id: p.id,
    type: p.type,
    title: p.title,
    description: p.description,
    reward: p.reward,
    language: p.language,
    content: { starter_code: p.content.starter_code },
  }
}

export const code = new Hono<AuthEnv>()

// id 를 주면 그 문제, 안 주면 language 로 거른 문제 중 커리큘럼·수준에 맞는 하나
code.get('', requireAuth, async (c) => {
  const requestedId = c.req.query('id')
  if (requestedId) {
    const found = codeProblems.find((problem) => problem.id === requestedId)
    if (!found) return c.json({ message: '문제를 찾을 수 없습니다' }, 404)
    return c.json({ problem: toQuestion(found) }, 200)
  }

  const language = c.req.query('language')
  const pool = filterByLanguage(codeProblems, language)
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
  const pickedId = pickProblemId({ type: 'code', language, level: user?.studyLevel, solved })
  const problem = unsolved.find((p) => p.id === pickedId) ?? unsolved[0]
  return c.json({ problem: toQuestion(problem) }, 200)
})

code.post('', requireAuth, async (c) => {
  const body = await readJsonBody(c)
  const { id, code: submitted } = body

  const problem = codeProblems.find((problem) => problem.id === id)
  if (!problem) {
    return c.json({ message: '문제를 찾을 수 없습니다' }, 404)
  }
  if (typeof submitted !== 'string' || submitted.trim() === '') {
    return c.json({ message: '코드를 입력해주세요' }, 400)
  }
  if (submitted.length > MAX_CODE_LENGTH) {
    return c.json({ message: `코드는 ${MAX_CODE_LENGTH}자 이하로 보내주세요` }, 400)
  }

  const checks = compiled.get(problem.id) ?? []
  const failed = checks
    .filter((check) => !check.regex.test(submitted))
    .map((check) => check.message)
  const isAnswer = failed.length === 0

  const userId = c.get('userId')
  await submissions.create({
    userId,
    problemId: problem.id,
    isCorrect: isAnswer,
    answer: submitted,
    runOutput: isAnswer ? undefined : failed.join('\n'),
  })

  if (isAnswer) {
    await awardSolveExp(userId, problem.id, problem.reward)
    return c.json({ isAnswer, passed: checks.length, total: checks.length }, 200)
  }
  return c.json(
    { isAnswer, passed: checks.length - failed.length, total: checks.length, failed },
    200,
  )
})
