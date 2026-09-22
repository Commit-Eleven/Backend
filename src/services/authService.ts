import { sign } from 'hono/jwt'
import { env } from '../lib/env'
import { Errors } from '../lib/errors'
import type { GoogleProfile } from '../lib/google'
import { normalizeNickname, randomNickname, randomTag } from '../lib/nickname'
import { refreshTokenRepository } from '../repositories/refreshTokenRepository'
import { type UserRow, userRepository } from '../repositories/userRepository'

export const ACCESS_TOKEN_TTL = 60 * 15 // 15분
export const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 14 // 14일
const MAX_TAG_RETRY = 20

// 리프레시 토큰 원문은 DB에 안 두고 해시만 저장
const sha256 = async (s: string) =>
  Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))).toString('hex')

type DbError = { code?: string; sqlMessage?: string; cause?: DbError }
const dbError = (e: unknown): DbError => {
  const err = e as DbError
  return err?.code ? err : (err?.cause ?? {})
}
const isDup = (e: unknown) => dbError(e).code === 'ER_DUP_ENTRY'
// 닉네임#태그 unique 에 걸린 경우만. 이때만 태그 다시 뽑음
const isTagDup = (e: unknown) =>
  isDup(e) && (dbError(e).sqlMessage ?? '').includes('uq_user_nickname_tag')

// 안 쓰인 태그 하나 뽑아서 fn 에 넘김. 넣는 사이에 누가 먼저 가져가면 다시 뽑음
async function withFreeTag<T>(fn: (tag: string) => Promise<T>): Promise<T> {
  for (let i = 0; i < MAX_TAG_RETRY; i++) {
    const tag = randomTag()
    if (await userRepository.existsByTag(tag)) continue
    try {
      return await fn(tag)
    } catch (e) {
      if (isTagDup(e)) continue
      throw e
    }
  }
  throw Errors.internal('태그 생성 실패')
}

// provider_id(구글 sub)로만 식별. 처음 오면 닉네임#태그 랜덤으로 만들어서 가입
// 닉네임은 중복 허용, 태그는 중복 불가
async function findOrCreateUser(profile: GoogleProfile): Promise<UserRow> {
  const existing = await userRepository.findByProviderId(profile.sub)
  if (existing) return existing
  try {
    return await withFreeTag((tag) =>
      userRepository.create({
        email: profile.email.toLowerCase(),
        nickname: randomNickname(),
        tag,
        providerId: profile.sub,
      }),
    )
  } catch (e) {
    // 같은 계정 첫 로그인이 동시에 들어오면 한쪽이 provider_id 중복으로 실패함. 먼저 만든 걸 씀
    if (isDup(e)) {
      const created = await userRepository.findByProviderId(profile.sub)
      if (created) return created
    }
    throw e
  }
}

// 액세스 토큰. sub=유저 id, 15분 만료
function accessToken(u: UserRow) {
  const iat = Math.floor(Date.now() / 1000)
  return sign({ sub: u.id, tier: u.tier, iat, exp: iat + ACCESS_TOKEN_TTL }, env.jwtSecret, 'HS256')
}

async function newRefreshToken(userId: number) {
  const raw = Buffer.from(crypto.getRandomValues(new Uint8Array(48))).toString('base64url')
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL * 1000)
  await refreshTokenRepository.create(userId, await sha256(raw), expiresAt)
  return raw
}

// 로그인 응답. 액세스 토큰은 body로, 리프레시는 라우트에서 쿠키로
async function issueTokens(u: UserRow) {
  const [token, refreshToken] = await Promise.all([accessToken(u), newRefreshToken(u.id)])
  return {
    token,
    refreshToken,
    user: { id: u.id, nickname: u.nickname, tag: u.tag, totalExp: u.totalExp, tier: u.tier },
  }
}

// 한 번 쓴 리프레시 토큰은 지우고 새로 발급
async function rotate(raw: string) {
  const invalid = () => Errors.unauthorized('리프레시 토큰 만료 또는 무효')
  const row = await refreshTokenRepository.findByHash(await sha256(raw))
  if (!row) throw invalid()
  // 같은 토큰으로 동시에 들어오면 먼저 지운 쪽만 통과
  if (!(await refreshTokenRepository.remove(row.id))) throw invalid()
  if (row.expiresAt.getTime() < Date.now()) throw invalid()

  const u = await userRepository.findById(row.userId)
  if (!u) throw invalid()
  const [token, refreshToken] = await Promise.all([accessToken(u), newRefreshToken(u.id)])
  return { token, refreshToken }
}

// 이 유저 리프레시 토큰 전부 삭제. 액세스 토큰은 만료(15분)까지는 살아 있음
async function logout(userId: number) {
  await refreshTokenRepository.removeAllByUser(userId)
}

// 닉네임 바꾸면 태그도 새로 뽑음
async function changeNickname(userId: number, input: unknown) {
  const nickname = normalizeNickname(input)
  if (!nickname) throw Errors.invalidInput('닉네임은 2~20자')
  if (!(await userRepository.findById(userId))) throw Errors.notFound('없는 사용자')
  return withFreeTag(async (tag) => {
    await userRepository.updateNickname(userId, nickname, tag)
    return { nickname, tag }
  })
}

export const authService = { findOrCreateUser, issueTokens, rotate, logout, changeNickname }
