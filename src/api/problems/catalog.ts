import { blankProblems } from './blank'
import { mcqProblems } from './mcq'
import { parsonsProblems } from './parsons'
import { shortProblems } from './short'
import { spaghettiProblems } from './spaghetti'

type ProblemType = 'fill_blank' | 'parsons' | 'multiple_choice' | 'short_answer' | 'spaghetti'

type ProblemSummary = {
  id: string
  type: ProblemType
  title: string
}

const problemsById = new Map<string, ProblemSummary>()

for (const [type, entries] of Object.entries({
  fill_blank: blankProblems,
  multiple_choice: mcqProblems,
  parsons: parsonsProblems,
  short_answer: shortProblems,
  spaghetti: spaghettiProblems,
}) as [ProblemType, { id: string; title: string }[]][]) {
  for (const entry of entries) {
    if (problemsById.has(entry.id)) {
      throw new Error(`문제 id 중복: ${entry.id} (${type})`)
    }
    problemsById.set(entry.id, { id: entry.id, type, title: entry.title })
  }
}

export function getProblemSummary(id: string): ProblemSummary | undefined {
  return problemsById.get(id)
}
