import { isDuplicateKey } from './db/errors'
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

const TAG_RANGE = 10 ** NICKNAME_TAG_LENGTH

// 4자리 태그. Math.random 대신 crypto 로 뽑고, 범위를 넘는 값은 버려서 편향을 없앤다
const randomTag = () => {
  const limit = Math.floor(0x1_0000_0000 / TAG_RANGE) * TAG_RANGE
  const buf = new Uint32Array(1)
  let value = 0
  do {
    crypto.getRandomValues(buf)
    value = buf[0] as number
  } while (value >= limit)
  return String(value % TAG_RANGE).padStart(NICKNAME_TAG_LENGTH, '0')
}

// 유니크 제약은 (nickname, tag) 조합이라 태그 하나만으로 겹치지 않아도 된다.
// 그래서 전역 태그 조회 없이, 실제 insert 가 충돌할 때만 다시 뽑는다.
export async function withFreeTag<T>(fn: (tag: string) => Promise<T>): Promise<T> {
  for (let i = 0; i < MAX_TAG_RETRY; i++) {
    try {
      return await fn(randomTag())
    } catch (e) {
      if (!isDuplicateKey(e)) throw e
    }
  }
  throw Errors.internal('닉네임 태그를 생성하는데 실패했습니다 (중복)')
}

export async function findOrCreateUser(profile: { sub: string; email: string }): Promise<UserRow> {
  const email = profile.email.toLowerCase()
  const existing = await users.findByProviderId(profile.sub)
  if (existing) return existing

  for (let i = 0; i < MAX_TAG_RETRY; i++) {
    try {
      return await users.create({
        email,
        nickname: randomNickname(),
        tag: randomTag(),
        providerId: profile.sub,
      })
    } catch (e) {
      if (!isDuplicateKey(e)) throw e
      // 중복은 태그뿐 아니라 providerId/email 충돌일 수도 있다.
      // 같은 계정으로 동시에 로그인해 먼저 만들어진 경우 그 계정을 그대로 쓴다.
      const raced = await users.findByProviderId(profile.sub)
      if (raced) return raced
      const sameEmail = await users.findByEmail(email)
      if (sameEmail) return sameEmail
      // 태그만 겹친 경우는 다음 반복에서 새 태그로 다시 시도한다
    }
  }
  throw Errors.internal('계정을 만드는데 실패했습니다 (중복)')
}
