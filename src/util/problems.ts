import { readdirSync } from 'node:fs'
import { STUDY_LEVEL } from './config/constants'

// 문제 원본(static/problems/*.json)의 공통 메타데이터 모음.
// 제출 이력 등에서 problemId로 title/type 같은 정보를 붙여줄 때 쓴다.

const FILES = ['mcq', 'blank', 'parsons', 'short', 'code'] as const

// 화면에 보여줄 유형 이름
export const TYPE_LABEL: Record<(typeof FILES)[number], string> = {
  mcq: '객관식',
  blank: '빈칸 채우기',
  parsons: '순서 맞추기',
  short: '주관식',
  code: '코드 작성',
}

type ProblemMeta = {
  id: string
  type: (typeof FILES)[number]
  title: string
  description?: string
  difficulty?: number
  level?: StudyLevel
  reward?: number
  language?: string
  unitId?: string
  lessonId?: string
}

export type StudyLevel = (typeof STUDY_LEVEL)[number]

export const isStudyLevel = (value: unknown): value is StudyLevel =>
  STUDY_LEVEL.includes(value as StudyLevel)

// 문제 등급. level 칸이 없는 예전 문제는 난이도(1, 2, 3)로 등급을 정한다
export function levelOf(problem: { level?: StudyLevel; difficulty?: number }): StudyLevel {
  if (problem.level) return problem.level
  if (problem.difficulty === 3) return 'advanced'
  if (problem.difficulty === 2) return 'intermediate'
  return 'beginner'
}

// GET /api/problems/<유형>?level=beginner 처럼 등급으로 거른다. level 이 없으면 전부
export function filterByLevel<T extends { level?: StudyLevel; difficulty?: number }>(
  list: T[],
  level?: StudyLevel,
): T[] {
  if (!level) return list
  return list.filter((problem) => levelOf(problem) === level)
}

// 문제 은행. static/problems/bank/ 안의 json 파일(예: python-beginner.json)을 모두 읽는다.
// 언어·등급마다 파일을 따로 두어서, 문제를 추가하는 PR 끼리 충돌하지 않게 한다
const BANK_DIR = 'static/problems/bank'
const bankFiles = (() => {
  try {
    return readdirSync(BANK_DIR)
      .filter((name) => name.endsWith('.json'))
      .sort()
  } catch {
    return []
  }
})()
const bank = (
  await Promise.all(bankFiles.map((name) => Bun.file(`${BANK_DIR}/${name}`).json()))
).flat() as { type: string }[]

// 유형별 문제 전체. static/problems/<유형>.json 다음에 문제 은행의 같은 유형을 붙인다
export async function loadProblems<T>(type: (typeof FILES)[number]): Promise<T[]> {
  const base = (await Bun.file(`static/problems/${type}.json`).json()) as T[]
  return [...base, ...(bank.filter((problem) => problem.type === type) as T[])]
}

export const problems: ProblemMeta[] = []
for (const file of FILES) {
  problems.push(...(await loadProblems<ProblemMeta>(file)))
}

export const problemMetaById = new Map(problems.map((problem) => [problem.id, problem]))

// 프론트가 GET /api/problems/<유형>?language=java 처럼 보내는 언어로 문제를 거른다.
// language 칸이 비어 있는 문제는 공통 문제로 보고 어느 언어에나 낸다
export function filterByLanguage<T extends { language?: string }>(
  list: T[],
  language?: string,
): T[] {
  if (!language) return list
  const lang = language.trim().toLowerCase() === 'js' ? 'javascript' : language.trim().toLowerCase()
  return list.filter((problem) => !problem.language || problem.language === lang)
}

// 제출한 답이 인정되는 답 중 하나와 같은지. 코드는 대소문자가 의미가 있어서 기본은 구분한다.
// HTML 태그처럼 대소문자가 상관없는 문제는 문제 파일에 "caseSensitive": false 를 넣는다
export function matchesAnswer(
  submitted: string,
  accepted: string[],
  caseSensitive = true,
): boolean {
  const normalize = (value: string) => (caseSensitive ? value.trim() : value.trim().toLowerCase())
  const target = normalize(submitted)
  return accepted.some((answer) => normalize(answer) === target)
}

// 레슨 안 문제 순서: 객관식 → 파슨스 → 단답(빈칸·단답형, 번호 순) → 서술형
const LESSON_TYPE_ORDER: Record<string, number> = {
  mcq: 0,
  parsons: 1,
  blank: 2,
  short: 2,
  code: 3,
}
const numberSuffix = (id: string) => Number(/-(\d+)$/.exec(id)?.[1] ?? 0)

export function problemsOfLesson(lessonId: string): ProblemMeta[] {
  return problems
    .filter((problem) => problem.lessonId === lessonId)
    .sort(
      (a, b) =>
        LESSON_TYPE_ORDER[a.type] - LESSON_TYPE_ORDER[b.type] ||
        numberSuffix(a.id) - numberSuffix(b.id),
    )
}
