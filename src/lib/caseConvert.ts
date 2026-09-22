// 요청/응답 필드명 변환

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

// 키 이름이 바뀌므로 반환 타입은 unknown. 호출부에서 캐스팅해서 쓴다.

/** 응답 데이터용: camelCase를 snake_case로 */
export function toSnakeCase(value: unknown): unknown {
  return mapKeysDeep(value, camelToSnakeKey)
}

/** 요청 데이터용: snake_case를 camelCase로 */
export function toCamelCase(value: unknown): unknown {
  return mapKeysDeep(value, snakeToCamelKey)
}
