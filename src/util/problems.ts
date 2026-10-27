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
