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
  reward?: number
  language?: string
  unitId?: string
}

export const problems: ProblemMeta[] = []
for (const file of FILES) {
  const data = (await Bun.file(`static/problems/${file}.json`).json()) as ProblemMeta[]
  problems.push(...data)
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
