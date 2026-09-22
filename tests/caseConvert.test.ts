import { describe, expect, test } from 'bun:test'
import { toCamelCase, toSnakeCase } from '../src/lib/caseConvert'

describe('toSnakeCase', () => {
  test('중첩 객체와 배열의 키를 재귀적으로 바꾼다', () => {
    const input = {
      solvedCount: 3,
      nextUnit: { unitId: 'conditionals', completePercent: 100 },
      problems: [{ problemId: 'p1' }, { problemId: 'p2' }],
    }
    expect(toSnakeCase(input)).toEqual({
      solved_count: 3,
      next_unit: { unit_id: 'conditionals', complete_percent: 100 },
      problems: [{ problem_id: 'p1' }, { problem_id: 'p2' }],
    })
  })

  test('null과 원시값은 그대로 둔다', () => {
    expect(toSnakeCase(null)).toBeNull()
    expect(toSnakeCase({ nextUnit: null, count: 0 })).toEqual({ next_unit: null, count: 0 })
  })
})

describe('toCamelCase', () => {
  test('요청 body의 snake_case 키를 camelCase로 바꾼다', () => {
    expect(toCamelCase({ target_user_id: 2, user_id: 1 })).toEqual({
      targetUserId: 2,
      userId: 1,
    })
  })
})
