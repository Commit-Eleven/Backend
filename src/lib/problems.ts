import { PROBLEM_FILE_PATHS, type ProblemType } from '../constants'

export type ProblemSummary = {
  id: string
  type: ProblemType
  title: string
}

type ProblemFileEntry = {
  id: string
  type: ProblemType
  title: string
}

async function loadProblems(): Promise<Map<string, ProblemSummary>> {
  const byId = new Map<string, ProblemSummary>()

  for (const [type, path] of Object.entries(PROBLEM_FILE_PATHS) as [ProblemType, string][]) {
    const entries = (await Bun.file(path).json()) as ProblemFileEntry[]
    for (const entry of entries) {
      if (byId.has(entry.id)) {
        throw new Error(`문제 id 중복: ${entry.id} (${path})`)
      }
      byId.set(entry.id, { id: entry.id, type, title: entry.title })
    }
  }

  return byId
}

// 서버 부팅 시 한 번만 로드해서 메모리에 들고 있는다 (요청마다 파일을 읽지 않음).
const problemsById = await loadProblems()

export function getProblemSummary(id: string): ProblemSummary | undefined {
  return problemsById.get(id)
}
