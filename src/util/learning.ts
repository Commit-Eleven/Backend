import { problemMetaById, TYPE_LABEL } from './problems'

// 커리큘럼(static/curriculum/curriculum.json)과 제출 기록으로 단원 진행 상황을 계산한다.

type Unit = { unitId: string; title: string; order: number; problemIds: string[] }
type Course = { courseId: string; title: string; language: string; units: Unit[] }

const courses = (await Bun.file('static/curriculum/curriculum.json').json()) as Course[]

export type ProblemStatus = 'correct' | 'wrong' | 'todo'

// 과정 순서 → 단원 순서로 한 줄로 편다. 다음 단원은 같은 언어의 다음 과정 첫 단원까지 이어진다
const flatUnits = courses.flatMap((course) =>
  [...course.units].sort((a, b) => a.order - b.order).map((unit) => ({ course, unit })),
)

export function findUnit(unitId: string) {
  const index = flatUnits.findIndex((u) => u.unit.unitId === unitId)
  if (index < 0) return undefined
  const current = flatUnits[index]
  // 다른 언어 코스로 넘어가지 않게 같은 언어 안에서만 다음 단원을 찾는다
  const next = flatUnits.slice(index + 1).find((u) => u.course.language === current.course.language)
  return { ...current, next }
}

export function firstUnitId(): string | undefined {
  return flatUnits[0]?.unit.unitId
}

// 진행률을 보여줄 단원을 고른다. 고른 단원이 있으면 그것, 없으면 아직 다 못 푼 첫 단원
export function currentUnitId(
  studyUnitId: string | null,
  solved: Map<string, boolean>,
  language?: string,
) {
  if (studyUnitId && findUnit(studyUnitId)) return studyUnitId
  const candidates = language ? flatUnits.filter((u) => u.course.language === language) : flatUnits
  const notDone = candidates.find((u) => unitProgress(u.unit, solved).completePercent < 100)
  return (notDone ?? candidates[0])?.unit.unitId
}

// 단원 안 문제별 상태와 합계. 문제 파일에 없는 id(아직 없는 유형)는 빼고 센다
export function unitProgress(unit: Unit, solved: Map<string, boolean>) {
  const problems = unit.problemIds
    .map((id) => problemMetaById.get(id))
    .filter((p) => p !== undefined)
    .map((p, i) => {
      const result = solved.get(p.id)
      const status: ProblemStatus =
        result === true ? 'correct' : result === false ? 'wrong' : 'todo'
      return {
        index: i + 1,
        id: p.id,
        type: p.type,
        typeLabel: TYPE_LABEL[p.type],
        title: p.title,
        reward: p.reward ?? 0,
        status,
      }
    })

  const total = problems.length
  const correct = problems.filter((p) => p.status === 'correct').length
  const wrong = problems.filter((p) => p.status === 'wrong').length
  return {
    total,
    solved: correct,
    wrong,
    remaining: total - correct,
    // 문제가 없는 단원은 0%로 둔다 (다 풀었다고 보지 않음)
    completePercent: total === 0 ? 0 : Math.round((correct / total) * 100),
    problems,
  }
}

const DAY_MS = 24 * 60 * 60 * 1000
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const kstDay = (d: Date) => Math.floor((d.getTime() + KST_OFFSET_MS) / DAY_MS)

// 연속 학습 일수. 한국 시간 기준 하루에 한 번이라도 제출했으면 그날은 공부한 날.
// 오늘 아직 안 풀었어도 어제까지 이어졌으면 끊긴 걸로 보지 않는다
export function streakDays(submittedAt: Date[], now = new Date()): number {
  const days = new Set(submittedAt.map(kstDay))
  let day = kstDay(now)
  if (!days.has(day)) day -= 1

  let streak = 0
  while (days.has(day)) {
    streak += 1
    day -= 1
  }
  return streak
}
