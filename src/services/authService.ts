import { sign } from 'hono/jwt'
import {
  DEFAULT_NICKNAME,
  JWT_EXPIRES_IN_SECONDS,
  NICKNAME_MAX_LENGTH,
  NICKNAME_TAG_LENGTH,
  NICKNAME_TAG_MAX_RETRIES,
} from '../constants'
import { env } from '../lib/env'
import { Errors } from '../lib/errors'
import type { NewUser } from '../repositories/userRepository'
import { userRepository } from '../repositories/userRepository'

export type GoogleProfile = {
  sub: string
  email: string
  name?: string
}

export type AuthUser = {
  id: number
  nickname: string
  tag: string
  totalExp: number
  providerId: string
}

// 서비스가 실제로 필요로 하는 최소 모양만 요구한다.
// 그래야 테스트에서 진짜 DB 로우와 무관한 fake를 그대로 넣을 수 있다.
type UserRepo = {
  findByProviderId(providerId: string): Promise<AuthUser | undefined>
  existsByNicknameAndTag(nickname: string, tag: string): Promise<boolean>
  create(data: NewUser): Promise<AuthUser>
}

function randomTag(): string {
  const max = 10 ** NICKNAME_TAG_LENGTH
  return String(Math.floor(Math.random() * max)).padStart(NICKNAME_TAG_LENGTH, '0')
}

function sanitizeNickname(name: string | undefined): string {
  const trimmed = name?.trim().slice(0, NICKNAME_MAX_LENGTH)
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_NICKNAME
}

export function createAuthService(repo: UserRepo) {
  /** (nickname, tag) 유니크 제약을 만족하는 tag를 뽑을 때까지 재시도 */
  async function assignUniqueTag(nickname: string): Promise<string> {
    for (let attempt = 0; attempt < NICKNAME_TAG_MAX_RETRIES; attempt++) {
      const tag = randomTag()
      const taken = await repo.existsByNicknameAndTag(nickname, tag)
      if (!taken) return tag
    }
    throw Errors.internal('닉네임 태그 배정 실패 (재시도 초과)')
  }

  /** 구글 sub로 있으면 로그인, 없으면 그 자리에서 가입 */
  async function findOrCreateGoogleUser(profile: GoogleProfile) {
    const existing = await repo.findByProviderId(profile.sub)
    if (existing) return { user: existing, isNewUser: false }

    const nickname = sanitizeNickname(profile.name)
    const tag = await assignUniqueTag(nickname)
    const created = await repo.create({
      email: profile.email,
      nickname,
      tag,
      providerId: profile.sub,
    })
    return { user: created, isNewUser: true }
  }

  async function issueToken(userId: number): Promise<string> {
    const now = Math.floor(Date.now() / 1000)
    return sign(
      { sub: String(userId), iat: now, exp: now + JWT_EXPIRES_IN_SECONDS },
      env.jwtSecret,
      'HS256',
    )
  }

  return { assignUniqueTag, findOrCreateGoogleUser, issueToken }
}

export const authService = createAuthService(userRepository)

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.google.clientId,
    redirect_uri: env.google.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

/** 인가 코드를 구글 프로필로 교환. 실제 네트워크 호출은 여기 하나뿐. */
export async function exchangeGoogleCode(code: string): Promise<GoogleProfile> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.google.clientId,
      client_secret: env.google.clientSecret,
      redirect_uri: env.google.redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!tokenRes.ok) throw Errors.unauthorized('구글 인증 코드 교환 실패')
  const { access_token } = (await tokenRes.json()) as { access_token: string }

  const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${access_token}` },
  })
  if (!profileRes.ok) throw Errors.unauthorized('구글 프로필 조회 실패')
  const profile = (await profileRes.json()) as { sub: string; email: string; name?: string }
  return { sub: profile.sub, email: profile.email, name: profile.name }
}
