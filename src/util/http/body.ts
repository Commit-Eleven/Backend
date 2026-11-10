import type { Context } from 'hono'
import { MAX_JSON_DEPTH } from '../config/constants'
import { Errors } from './response'

// 짝이 없는 서러게이트 같은 깨진 유니코드
const BROKEN_CHAR = /\p{Cs}/u

// 본문이 없거나 JSON 이 아니면 빈 객체, JSON 이어도 객체가 아니면(null, 배열 등) 400
export async function readJsonBody(c: Context): Promise<Record<string, unknown>> {
  const body: unknown = await c.req.json().catch(() => ({}))
  if (!isPlainObject(body)) throw Errors.invalidInput('요청 본문은 JSON 객체여야 합니다')
  assertSafe(body)
  return body
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// 너무 깊게 중첩됐거나 깨진 문자가 있으면 400. 깊은 값에서 스택이 넘치지 않게 재귀 없이 훑는다
function assertSafe(root: unknown): void {
  const stack: [unknown, number][] = [[root, 1]]
  while (stack.length > 0) {
    const [value, depth] = stack.pop() as [unknown, number]
    if (typeof value === 'string') {
      if (BROKEN_CHAR.test(value))
        throw Errors.invalidInput('올바르지 않은 문자가 포함되어 있습니다')
      continue
    }
    if (value === null || typeof value !== 'object') continue
    if (depth > MAX_JSON_DEPTH) throw Errors.invalidInput('요청 본문이 너무 깊게 중첩되어 있습니다')

    for (const [key, child] of Object.entries(value)) {
      if (BROKEN_CHAR.test(key)) throw Errors.invalidInput('올바르지 않은 문자가 포함되어 있습니다')
      stack.push([child, depth + 1])
    }
  }
}
