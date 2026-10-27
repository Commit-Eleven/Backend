import { Hono } from 'hono'
import { STUDY_LANGUAGE } from '../util/config/constants'
import { users } from '../util/db/users'
import { type AuthEnv, requireAuth } from '../util/http/auth'
import { Errors, ok } from '../util/http/response'

export const tags = new Hono<AuthEnv>()

// 문제를 거르는 데 쓰는 태그 목록. DB가 아니라 고정 상수라 조회만 한다
tags.get('', requireAuth, (c) => {
  return ok(c, { tags: STUDY_LANGUAGE })
})

type StudyLanguage = (typeof STUDY_LANGUAGE)[number]
const isStudyLanguage = (v: unknown): v is StudyLanguage =>
  STUDY_LANGUAGE.includes(v as StudyLanguage)

// 내 학습 언어를 body의 tag 키 값으로 설정한다
tags.patch('', requireAuth, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { tag?: unknown }
  if (!isStudyLanguage(body.tag)) throw Errors.invalidInput('tag 값이 잘못됨')

  const userId = c.get('userId')
  if (!(await users.findById(userId))) throw Errors.notFound('없는 사용자')

  await users.updateStudyLanguage(userId, body.tag)
  return ok(c, { studyLanguage: body.tag })
})
