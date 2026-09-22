import { CURRICULUM_FILE_PATH } from '../constants'
import { getProblemSummary } from './problems'

export type Unit = {
  unitId: string
  title: string
  order: number
  problemIds: string[]
}

export type Course = {
  courseId: string
  title: string
  units: Unit[]
}

async function loadCurriculum(): Promise<Course[]> {
  const courses = (await Bun.file(CURRICULUM_FILE_PATH).json()) as Course[]

  for (const course of courses) {
    for (const unit of course.units) {
      for (const problemId of unit.problemIds) {
        if (!getProblemSummary(problemId)) {
          throw new Error(`커리큘럼에 없는 문제 id: ${problemId} (unit: ${unit.unitId})`)
        }
      }
    }
  }

  return courses
}

// 서버 부팅 시 한 번만 로드. problemIds가 문제 파일에 실제로 있는지도 여기서 검증한다.
const courses = await loadCurriculum()

export function findUnit(unitId: string): { course: Course; unit: Unit } | undefined {
  for (const course of courses) {
    const unit = course.units.find((u) => u.unitId === unitId)
    if (unit) return { course, unit }
  }
  return undefined
}

export function nextUnitOf(course: Course, unit: Unit): Unit | undefined {
  return course.units.find((u) => u.order === unit.order + 1)
}
