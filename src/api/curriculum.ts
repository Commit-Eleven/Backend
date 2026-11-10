import { Hono } from 'hono'
import { STUDY_LANGUAGE } from '../util/config/constants'
import { type AuthEnv, requireAuth } from '../util/http/auth'
import { Errors } from '../util/http/response'

type Unit = {
  unitId: string
  title: string
  order: number
  problemIds: string[]
}

type Course = {
  courseId: string
  title: string
  language: (typeof STUDY_LANGUAGE)[number]
  units: Unit[]
}

export const curriculumData = (await Bun.file(
  'static/curriculum/curriculum.json',
).json()) as Course[]

export const curriculum = new Hono<AuthEnv>()

// language 를 주면 그 언어의 코스만, 안 주면 전체
curriculum.get('', requireAuth, (c) => {
  const language = c.req.query('language')
  if (language !== undefined && !STUDY_LANGUAGE.includes(language as Course['language'])) {
    throw Errors.invalidInput(`language 는 ${STUDY_LANGUAGE.join(', ')} 중 하나`)
  }

  const courses = language
    ? curriculumData.filter((course) => course.language === language)
    : curriculumData
  if (courses.length === 0) {
    return c.json({ message: '커리큘럼이 비어있습니다' }, 404)
  }

  return c.json({ curriculum: courses }, 200)
})
