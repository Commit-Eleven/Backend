import { Hono } from 'hono'
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

type McqProblem = {
  id: string
  type: 'mcq'
  title: string
  reward: number
  difficulty?: number
  level?: StudyLevel
  lessonId?: string
  description?: string
  language?: string
  content: {
    choices: string[]
    answer: number
  }
}

export const mcqProblems = await loadProblems<McqProblem>('mcq')

// 조회할 때 정답(answer)은 빼고 내려준다
export function toQuestion(p: McqProblem) {
  const { answer, ...content } = p.content
  return {
    id: p.id,
    type: p.type,
    title: p.title,
    description: p.description,
    reward: p.reward,
    language: p.language,
    level: levelOf(p),
    lessonId: p.lessonId,
    content,
  }
}

export const mcq = new Hono<AuthEnv>()

// id 를 주면 그 문제, 안 주면 language 로 거른 문제 중 커리큘럼·수준에 맞는 하나
mcq.get('', requireAuth, async (c) => {
  const requestedId = c.req.query('id')
  if (requestedId) {
    const found = mcqProblems.find((problem) => problem.id === requestedId)
    if (!found) return c.json({ message: '문제를 찾을 수 없습니다' }, 404)
    return c.json({ problem: toQuestion(found) }, 200)
  }

  const language = c.req.query('language')
  const level = c.req.query('level')
  if (level !== undefined && !isStudyLevel(level)) {
    return c.json({ message: `level 은 ${STUDY_LEVEL.join(', ')} 중 하나` }, 400)
  }
  const pool = filterByLevel(filterByLanguage(mcqProblems, language), level)
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
  const id = pickProblemId({ type: 'mcq', language, level: user?.studyLevel, solved })
  const problem = toQuestion(unsolved.find((p) => p.id === id) ?? unsolved[0])
  return c.json({ problem }, 200)
})

mcq.post('', requireAuth, async (c) => {
  const body = await readJsonBody(c)
  const { id, answer } = body
  const userId = c.get('userId')

  const problem = mcqProblems.find((problem) => problem.id === id)

  if (!problem) {
    return c.json({ message: '문제를 찾을 수 없습니다' }, 404)
  }

  // answer 는 보기 배열의 번호라 0부터 센다. "1" 처럼 글자로 와도 숫자로 본다
  const picked = typeof answer === 'string' && /^\d+$/.test(answer.trim()) ? Number(answer) : answer
  const isAnswer = problem.content.answer === picked
  await submissions.create({ userId, problemId: problem.id, isCorrect: isAnswer, answer: picked })

  if (isAnswer) {
    const exp = await awardSolveExp(userId, problem.id, problem.reward)
    return c.json({ isAnswer, ...exp }, 200)
  } else {
    const { answer: correct, choices } = problem.content
    return c.json({ isAnswer, answer: correct, answerText: choices[correct] }, 200)
  }
})
