import { Hono } from 'hono'
import { type AuthEnv, requireAuth } from '../util/http/auth'

type Unit = {
  unitId: string
  title: string
  order: number
  problemIds: string[]
}

type Course = {
  courseId: string
  title: string
  units: Unit[]
}

export const curriculumData = (await Bun.file(
  'static/curriculum/curriculum.json',
).json()) as Course[]

export const curriculum = new Hono<AuthEnv>()

curriculum.get('', requireAuth, (c) => {
  if (curriculumData.length === 0) {
    return c.json({ message: '커리큘럼이 비어있습니다' }, 404)
  }

  return c.json({ curriculum: curriculumData }, 200)
})
