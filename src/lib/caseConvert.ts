// API 파라미터(요청/응답 JSON, URL)는 전부 snake_case, 서버 내부 코드는 camelCase로 통일한다.
// 그 경계에서 변환은 여기 한 곳에서만 한다 (라우터마다 필드 이름 따로 바꿔주지 않기 위함).

function camelToSnakeKey(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

function snakeToCamelKey(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase())
}

function mapKeysDeep(value: unknown, mapKey: (key: string) => string): unknown {
  if (Array.isArray(value)) return value.map((item) => mapKeysDeep(item, mapKey))

  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [mapKey(key), mapKeysDeep(v, mapKey)]),
    )
  }

  return value
}

// 키 이름 자체가 바뀌므로 입력 타입을 그대로 반환 타입으로 쓰면 거짓이 된다.
// 호출부에서 필요한 타입으로 명시적으로 캐스팅해서 쓴다.

/** 응답으로 나갈 데이터: camelCase(내부) → snake_case(응답) */
export function toSnakeCase(value: unknown): unknown {
  return mapKeysDeep(value, camelToSnakeKey)
}

/** 요청으로 들어온 데이터: snake_case(요청) → camelCase(내부) */
export function toCamelCase(value: unknown): unknown {
  return mapKeysDeep(value, snakeToCamelKey)
}
