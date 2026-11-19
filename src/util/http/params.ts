import { Errors } from './response'

// 경로나 본문에서 받은 양의 정수 id 를 검사한다
export function parseId(raw: unknown, field: string): number {
  const value =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && /^[1-9]\d*$/.test(raw)
        ? Number(raw)
        : NaN
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw Errors.invalidInput(`${field}는 양의 정수여야 합니다`)
  }
  return value
}

// 쿼리 문자열의 양의 정수. 없으면 기본값
export function parseQueryInt(
  raw: string | undefined,
  fallback: number,
  field: string,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (raw === undefined) return fallback
  const value = parseId(raw, field)
  if (value > max) throw Errors.invalidInput(`${field}는 ${max} 이하`)
  return value
}

export function parseQueryBool(raw: string | undefined, field: string): boolean | undefined {
  if (raw === undefined) return undefined
  if (raw !== 'true' && raw !== 'false') throw Errors.invalidInput(`${field}는 true 또는 false`)
  return raw === 'true'
}

// 허용된 값 중 하나인지 검사한다
export function parseEnum<T extends string>(
  raw: unknown,
  values: readonly T[],
  field: string,
): T | undefined {
  if (raw === undefined) return undefined
  if (typeof raw !== 'string' || !(values as readonly string[]).includes(raw)) {
    throw Errors.invalidInput(`${field}는 ${values.join(', ')} 중 하나`)
  }
  return raw as T
}
