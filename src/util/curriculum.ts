import type { STUDY_LANGUAGE } from './config/constants'

// 커리큘럼은 언어별 파일(static/curriculum/<language>.json)로 나눠 두고,
// 서버에서는 한 목록으로 합쳐서 쓴다.

export type Unit = {
  unitId: string
  title: string
  order: number
  problemIds: string[]
}

export type Course = {
  courseId: string
  title: string
  language: (typeof STUDY_LANGUAGE)[number]
  units: Unit[]
}

// 기존 curriculum.json 과 같은 코스 순서를 유지한다
const COURSE_ORDER = [
  'python',
  'html',
  'javascript',
  'java',
] as const satisfies readonly (typeof STUDY_LANGUAGE)[number][]

export const curriculumData = await Promise.all(
  COURSE_ORDER.map(async (language) => {
    return (await Bun.file(`static/curriculum/${language}.json`).json()) as Course
  }),
)
