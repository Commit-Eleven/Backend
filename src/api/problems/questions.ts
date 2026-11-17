import { blankProblems, toQuestion as blankQuestion } from './blank'
import { codeProblems, toQuestion as codeQuestion } from './code'
import { mcqProblems, toQuestion as mcqQuestion } from './mcq'
import { parsonsProblems, toQuestion as parsonsQuestion } from './parsons'
import { shortProblems, toQuestion as shortQuestion } from './short'

// 문제 id → 화면에 내려줄 문제 (정답은 뺀 모양). 각 유형의 GET 과 같은 모양이다
export const questionById = new Map<string, object>([
  ...mcqProblems.map((p) => [p.id, mcqQuestion(p)] as const),
  ...blankProblems.map((p) => [p.id, blankQuestion(p)] as const),
  ...parsonsProblems.map((p) => [p.id, parsonsQuestion(p)] as const),
  ...shortProblems.map((p) => [p.id, shortQuestion(p)] as const),
  ...codeProblems.map((p) => [p.id, codeQuestion(p)] as const),
])
