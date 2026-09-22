import type { Context } from 'hono'
import { Hono } from 'hono'
import { deleteCookie, getCookie, getSignedCookie, setCookie, setSignedCookie } from 'hono/cookie'
import { type AuthEnv, requireAuth } from '../lib/auth'
import { env } from '../lib/env'
import { authUrl, exchangeCode, googleReady, verifyIdToken } from '../lib/google'
import { fail, ok } from '../lib/response'
import { authService, REFRESH_TOKEN_TTL } from '../services/authService'

// 가입/로그인은 구글로만. 이메일·비밀번호 계정 없음
export const auth = new Hono<AuthEnv>()

// 구글 갔다 올 동안 state/nonce/verifier 들고 있을 쿠키 (10분)
const OAUTH_COOKIE = 'g_oauth'
const oauthCookieOpts = {
  path: '/auth/google',
  httpOnly: true,
  secure: env.isProd,
  sameSite: 'Lax' as const,
  maxAge: 600,
}

// 리프레시 토큰 쿠키. /auth 밑으로만 전송
const REFRESH_COOKIE = 'refreshToken'
const setRefreshCookie = (c: Context, raw: string) =>
  setCookie(c, REFRESH_COOKIE, raw, {
    path: '/auth',
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'Lax',
    maxAge: REFRESH_TOKEN_TTL,
  })

// 구글 동의 화면으로 보냄
auth.get('/auth/google', async (c) => {
  if (!googleReady) return fail(c, 'NOT_CONFIGURED', 'GOOGLE_* 환경변수 없음', 503)
  const { url, state, nonce, codeVerifier } = await authUrl()
  const saved = JSON.stringify({ state, nonce, codeVerifier })
  await setSignedCookie(c, OAUTH_COOKIE, saved, env.cookieSecret, oauthCookieOpts)
  return c.redirect(url, 302)
})

// 첫 방문이면 가입, 이미 있으면 로그인. 둘 다 { token, user }
auth.get('/auth/google/callback', async (c) => {
  if (!googleReady) return fail(c, 'NOT_CONFIGURED', 'GOOGLE_* 환경변수 없음', 503)
  const { code, state, error } = c.req.query()
  const saved = await getSignedCookie(c, env.cookieSecret, OAUTH_COOKIE)
  deleteCookie(c, OAUTH_COOKIE, { path: '/auth/google' })

  if (error) return fail(c, 'GOOGLE_DENIED', `구글 로그인 취소: ${error}`, 400)
  if (!code || !state || !saved) return fail(c, 'INVALID_INPUT', '잘못된 콜백', 400)
  const s = JSON.parse(saved) as { state: string; nonce: string; codeVerifier: string }
  if (s.state !== state) return fail(c, 'INVALID_INPUT', 'state 불일치', 400)

  const { id_token } = await exchangeCode(code, s.codeVerifier)
  const profile = await verifyIdToken(id_token, s.nonce)
  if (!profile.emailVerified) return fail(c, 'FORBIDDEN', '인증 안 된 구글 이메일', 403)

  const u = await authService.findOrCreateUser(profile)
  const { token, refreshToken, user } = await authService.issueTokens(u)
  setRefreshCookie(c, refreshToken)

  // 프론트 주소 있으면 토큰 실어서 넘기고, 없으면 그냥 JSON
  if (env.frontendUrl) {
    return c.redirect(`${env.frontendUrl}/auth/callback?token=${encodeURIComponent(token)}`, 302)
  }
  return ok(c, { token, user })
})

// body에 refreshToken(refresh_token) 없으면 쿠키에서
auth.post('/auth/refresh', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const fromBody = body.refreshToken ?? body.refresh_token
  const raw = typeof fromBody === 'string' && fromBody ? fromBody : getCookie(c, REFRESH_COOKIE)
  if (!raw) return fail(c, 'UNAUTHORIZED', '리프레시 토큰 만료 또는 무효', 401)

  const { token, refreshToken } = await authService.rotate(raw)
  setRefreshCookie(c, refreshToken)
  return ok(c, { token })
})

// DB 행 지우고 쿠키도 비움
auth.post('/auth/logout', requireAuth, async (c) => {
  await authService.logout(c.get('userId'))
  deleteCookie(c, REFRESH_COOKIE, { path: '/auth' })
  return c.body(null, 204)
})
