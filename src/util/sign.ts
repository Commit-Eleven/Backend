import { type UserRow, users } from './db/users'
import { Errors } from './http/response'

const NICKNAME_TAG_LENGTH = 4
const MAX_TAG_RETRY = 16

const ADJECTIVES = [
  '명랑한',
  '고귀한',
  '용감한',
  '조용한',
  '느긋한',
  '재빠른',
  '수줍은',
  '당당한',
  '엉뚱한',
  '다정한',
  '씩씩한',
  '총명한',
  '부지런한',
  '장난스러운',
  '호기심많은',
  '차분한',
  '유쾌한',
  '단단한',
  '포근한',
  '날렵한',
  '진지한',
  '능청스러운',
  '산뜻한',
  '든든한',
  '반짝이는',
  '졸린',
  '배고픈',
  '신난',
  '의젓한',
  '귀여운',
  '늠름한',
  '똑똑한',
]

const NOUNS = [
  '황소',
  '영웅',
  '여우',
  '고래',
  '부엉이',
  '판다',
  '수달',
  '펭귄',
  '호랑이',
  '다람쥐',
  '두루미',
  '코끼리',
  '고슴도치',
  '돌고래',
  '너구리',
  '물범',
  '기린',
  '사자',
  '토끼',
  '거북이',
  '올빼미',
  '참새',
  '해달',
  '치타',
  '늑대',
  '곰',
  '매',
  '오리',
  '낙타',
  '사슴',
  '하마',
  '앵무새',
]

const pick = <T>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)] as T

const randomNickname = () => `${pick(ADJECTIVES)}${pick(NOUNS)}`

const randomTag = () =>
  String(Math.floor(Math.random() * 10 ** NICKNAME_TAG_LENGTH)).padStart(NICKNAME_TAG_LENGTH, '0')

export async function withFreeTag<T>(fn: (tag: string) => Promise<T>): Promise<T> {
  for (let i = 0; i < MAX_TAG_RETRY; i++) {
    const tag = randomTag()
    if (await users.existsByTag(tag)) continue
    try {
      return await fn(tag)
    } catch (e) {
      if ((e as { code?: string }).code === 'ER_DUP_ENTRY') continue
      throw e
    }
  }
  throw Errors.internal('태그를 생성하는데 실패했습니다 (중복)')
}

export async function findOrCreateUser(profile: { sub: string; email: string }): Promise<UserRow> {
  const existing = await users.findByProviderId(profile.sub)
  if (existing) return existing
  return withFreeTag((tag) =>
    users.create({
      email: profile.email.toLowerCase(),
      nickname: randomNickname(),
      tag,
      providerId: profile.sub,
    }),
  )
}
