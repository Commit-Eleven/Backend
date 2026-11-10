import { Hono } from 'hono'
import { STUDY_LANGUAGE } from '../util/config/constants'
import { lessons } from '../util/db/lessons'
import { type AuthEnv, requireAuth } from '../util/http/auth'
import { readJsonBody } from '../util/http/body'
import { Errors, ok } from '../util/http/response'

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
