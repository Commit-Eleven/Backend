// 문제 원본(static/problems/*.json)의 공통 메타데이터 모음.
// 제출 이력 등에서 problemId로 title/type 같은 정보를 붙여줄 때 쓴다.

const FILES = ['mcq', 'blank', 'parsons', 'short'] as const

type ProblemMeta = {
  id: string
  type: (typeof FILES)[number]
  title: string
  description?: string
  difficulty?: number
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
