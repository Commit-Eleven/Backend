// mysql2 는 유니크 제약 위반을 code='ER_DUP_ENTRY' 로 알려준다
export function isDuplicateKey(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ER_DUP_ENTRY'
  )
}
