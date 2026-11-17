import { Hono } from 'hono'
import { gradeSubmittedCode } from '../../util/ai/code-grader'
import { type CodeCheck, compileChecks, gradeCode } from '../../util/code-grader'
import { STUDY_LEVEL } from '../../util/config/constants'
import { awardSolveExp } from '../../util/db/exp'
import { submissions } from '../../util/db/submissions'
import { users } from '../../util/db/users'
import { type AuthEnv, requireAuth } from '../../util/http/auth'
import { readJsonBody } from '../../util/http/body'
import { pickProblemId } from '../../util/learning'
import {
  excludeSolved,
  filterByLanguage,
  filterByLevel,
  isStudyLevel,
  levelOf,
  loadProblems,
  type StudyLevel,
} from '../../util/problems'

type CodeProblem = {
  id: string
  type: 'code'
  title: string
  reward: number
  difficulty?: number
  level?: StudyLevel
  lessonId?: string
  description?: string
  language?: string
  content: {
    starter_code: string
    checks: CodeCheck[]
  }
}

// 사용자 코드는 실행하지 않는다. 문법 검사 후, 주석·문자열을 뺀 코드가 문제별 규칙(정규식)에 맞는지 본다
export const codeProblems = await loadProblems<CodeProblem>('code')
const compiled = new Map(codeProblems.map((p) => [p.id, compileChecks(p.content.checks)]))

const MAX_CODE_LENGTH = 10_000

// 조회할 때 채점 규칙(checks)은 빼고 내려준다
export function toQuestion(p: CodeProblem) {
  return {
    id: p.id,
    type: p.type,
    title: p.title,
    description: p.description,
    reward: p.reward,
    language: p.language,
    level: levelOf(p),
    lessonId: p.lessonId,
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
  const level = c.req.query('level')
  if (level !== undefined && !isStudyLevel(level)) {
    return c.json({ message: `level 은 ${STUDY_LEVEL.join(', ')} 중 하나` }, 400)
  }
  const pool = filterByLevel(filterByLanguage(codeProblems, language), level)
  if (pool.length === 0) {
    const label = [language, level].filter(Boolean).join(' ')
    const message = label ? `${label} 문제가 아직 없습니다` : '문제 풀이 비어있습니다'
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

  const result = gradeCode(submitted, problem.language, compiled.get(problem.id) ?? [])
  let isAnswer = result.isAnswer
  let passed = result.passed
  const total = result.total
  let failed = result.failed
  const syntaxError = result.syntaxError

  // 정적 검사에서 놓친 의미상 정답만 AI로 보완한다. 문법 오류는 AI로 통과시키지 않는다.
  if (!isAnswer && !syntaxError) {
    const aiGrade = await gradeSubmittedCode({
      title: problem.title,
      description: problem.description,
      language: problem.language,
      code: submitted,
      failedChecks: failed,
    })
    if (aiGrade === true) {
      isAnswer = true
      passed = total
      failed = []
    }
  }

  const userId = c.get('userId')
  await submissions.create({
    userId,
    problemId: problem.id,
    isCorrect: isAnswer,
    answer: submitted,
    runOutput: isAnswer ? undefined : failed.join('\n'),
  })

  if (isAnswer) {
    const exp = await awardSolveExp(userId, problem.id, problem.reward)
    return c.json({ isAnswer, passed, total, ...exp }, 200)
  }
  return c.json({ isAnswer, passed, total, failed, ...(syntaxError ? { syntaxError } : {}) }, 200)
})
