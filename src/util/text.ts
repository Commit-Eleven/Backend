// 글자 수 기준으로 자른다. 이모지 같은 글자가 중간에서 깨지지 않는다
export function truncate(text: string, max: number): string {
  const chars = Array.from(text)
  return chars.length <= max ? text : chars.slice(0, max).join('')
}

// 목록에 보여줄 한두 줄 요약
export function excerpt(text: string, max: number): string {
  return truncate(text.replace(/\s+/g, ' ').trim(), max)
}
