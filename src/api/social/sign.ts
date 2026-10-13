import { NICKNAME_TAG_LENGTH } from '../../util/config/constants'
import { type UserRow, users } from '../../util/db/users'
import { Errors } from '../../util/http/response'

// 가입 때 랜덤 이름 + 4자리 태그로 닉네임 자동 생성

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

// 자동 생성은 띄어쓰기 없이. 예: 호기심많은기린
const randomNickname = () => `${pick(ADJECTIVES)}${pick(NOUNS)}`

// 0000 ~ 9999
const randomTag = () =>
  String(Math.floor(Math.random() * 10 ** NICKNAME_TAG_LENGTH)).padStart(NICKNAME_TAG_LENGTH, '0')

const MAX_TAG_RETRY = 20

// 안 쓰인 태그 하나 뽑아서 fn 에 넘김. 넣는 사이에 누가 먼저 가져가면 다시 뽑음
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
  throw Errors.internal('태그 생성 실패')
}

// provider_id(구글 sub)로만 식별. 처음 오면 닉네임#태그 랜덤으로 만들어서 가입
// 닉네임은 중복 허용, 태그는 중복 불가
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
