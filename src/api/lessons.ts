import { Hono } from 'hono'
import { STUDY_LANGUAGE } from '../util/config/constants'
import { lessons } from '../util/db/lessons'
import { submissions } from '../util/db/submissions'
import { type AuthEnv, requireAuth } from '../util/http/auth'
import { readJsonBody } from '../util/http/body'
import { Errors, ok } from '../util/http/response'
import { problemsOfLesson, TYPE_LABEL } from '../util/problems'
import { questionById } from './problems/questions'

export const lessonsApi = new Hono<AuthEnv>()

const LESSON_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/

// 레슨 완료 저장. 문제가 없는 설명 레슨도 기록할 수 있다. 같은 레슨을 또 보내도 한 번만 남는다
lessonsApi.post('/:lessonId/complete', requireAuth, async (c) => {
  const lessonId = c.req.param('lessonId')
  if (!LESSON_ID_PATTERN.test(lessonId)) {
    throw Errors.invalidInput('lessonId 는 영문·숫자·_ . - 로 64자 이하')
  }

  const body = (await readJsonBody(c)) as { language?: unknown }
  if (!STUDY_LANGUAGE.includes(body.language as (typeof STUDY_LANGUAGE)[number])) {
    throw Errors.invalidInput(`language 는 ${STUDY_LANGUAGE.join(', ')} 중 하나`)
  }

  const row = await lessons.complete(c.get('userId'), lessonId, body.language as string)
  return ok(c, { lessonId: row.lessonId, language: row.language, completedAt: row.completedAt })
})

// 레슨 문제 전체를 출제 순서대로 한 번에 (정답 제외). 문제마다 내 풀이 상태(status)도 붙인다
lessonsApi.get('/:lessonId/problems', requireAuth, async (c) => {
  const lessonId = c.req.param('lessonId')
  if (!LESSON_ID_PATTERN.test(lessonId)) {
    throw Errors.invalidInput('lessonId 는 영문·숫자·_ . - 로 64자 이하')
  }
  const list = problemsOfLesson(lessonId)
  if (list.length === 0) throw Errors.notFound('문제가 있는 레슨이 아님')

  const solved = await submissions.solvedMapByUser(c.get('userId'))
  const problems = list.map((problem, i) => {
    const result = solved.get(problem.id)
    return {
      index: i + 1,
      status: result === true ? 'correct' : result === false ? 'wrong' : 'todo',
      typeLabel: TYPE_LABEL[problem.type],
      ...questionById.get(problem.id),
    }
  })
  const correct = problems.filter((problem) => problem.status === 'correct').length
  return ok(c, { lessonId, total: problems.length, solved: correct, problems })
})
