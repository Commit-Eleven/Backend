import { eq } from 'drizzle-orm'
import { type Context, Hono } from 'hono'
import { deleteCookie, getCookie, getSignedCookie, setCookie, setSignedCookie } from 'hono/cookie'
import { sign, verifyWithJwks } from 'hono/jwt'
import { env } from '../../util/config/env'
import { db } from '../../util/db/connection'
import { refreshToken as refreshTokenTable } from '../../util/db/schema'
import { type UserRow, users } from '../../util/db/users'
import { type AuthEnv, requireAuth } from '../../util/http/auth'
import { Errors, fail, ok } from '../../util/http/response'
import { findOrCreateUser } from '../../util/sign'

// 구글 OAuth: 동의 화면 URL 만들기 → code 를 토큰으로 교환 → id_token 검증

const { clientId, clientSecret, redirectUri } = env.google

// 셋 다 있어야 구글 로그인 켜짐. 없으면 /api/social/login/google 이 503
const googleReady = !!(clientId && clientSecret && redirectUri)

// state/nonce/PKCE 용 랜덤값이랑 해시
const b64url = (b: Uint8Array) => Buffer.from(b).toString('base64url')
const random = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)))
const sha256 = async (s: string) =>
  b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))))

// state는 CSRF, nonce는 id_token 재사용, PKCE는 code 가로채기 막는 용도
async function authUrl() {
  const state = random()
  const nonce = random()
  const codeVerifier = random(48)
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: clientId as string,
    redirect_uri: redirectUri as string,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: await sha256(codeVerifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString()
  return { url: url.toString(), state, nonce, codeVerifier }
}

// 구글에서 받은 code 를 토큰으로 교환. 서버끼리 통신이라 client_secret 씀
async function exchangeCode(code: string, codeVerifier: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId as string,
      client_secret: clientSecret as string,
      redirect_uri: redirectUri as string,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    }),
  })
  if (!res.ok) throw new Error(`구글 토큰 교환 실패 ${res.status}: ${await res.text()}`)
  return (await res.json()) as { id_token: string }
}

// id_token 에서 뽑아 쓰는 것만
type GoogleProfile = { sub: string; email: string; emailVerified: boolean }

// 구글 공개키로 서명 확인하고 iss/aud/exp는 verifyWithJwks가 보고 nonce는 직접 비교
async function verifyIdToken(idToken: string, nonce: string): Promise<GoogleProfile> {
  const p = await verifyWithJwks(idToken, {
    jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
    allowedAlgorithms: ['RS256'],
    // iat는 구글 서버랑 시계가 몇 초만 어긋나도 튕겨서 끔. exp는 그대로 검사
    verification: {
      iss: /^(https:\/\/)?accounts\.google\.com$/,
      aud: clientId as string,
      iat: false,
    },
  })
  if (p.nonce !== nonce) throw new Error('nonce 불일치')
  if (typeof p.sub !== 'string' || typeof p.email !== 'string') {
    throw new Error('id_token에 sub/email 없음')
  }
  return { sub: p.sub, email: p.email, emailVerified: p.email_verified === true }
}

const ACCESS_TOKEN_TTL = 60 * 15
const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 14
const tokenHash = async (raw: string) =>
  Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))).toString('hex')

// 액세스 토큰. sub=유저 id, 15분 만료
function accessToken(u: UserRow) {
  const iat = Math.floor(Date.now() / 1000)
  return sign({ sub: u.id, tier: u.tier, iat, exp: iat + ACCESS_TOKEN_TTL }, env.jwtSecret, 'HS256')
}

async function newRefreshToken(userId: number) {
  const raw = Buffer.from(crypto.getRandomValues(new Uint8Array(48))).toString('base64url')
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL * 1000)
  await db.insert(refreshTokenTable).values({ userId, tokenHash: await tokenHash(raw), expiresAt })
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
  const [row] = await db
    .select()
    .from(refreshTokenTable)
    .where(eq(refreshTokenTable.tokenHash, await tokenHash(raw)))
  if (!row) throw invalid()
  await db.delete(refreshTokenTable).where(eq(refreshTokenTable.id, row.id))
  if (row.expiresAt.getTime() < Date.now()) throw invalid()

  const u = await users.findById(row.userId)
  if (!u) throw invalid()
  const [token, refreshToken] = await Promise.all([accessToken(u), newRefreshToken(u.id)])
  return { token, refreshToken }
}

// 가입/로그인은 구글로만. 이메일·비밀번호 계정 없음
export const login = new Hono<AuthEnv>()

// 구글 갔다 올 동안 state/nonce/verifier 들고 있을 쿠키 (10분)
const OAUTH_COOKIE = 'g_oauth'
const oauthCookieOpts = {
  path: '/api/social/login/google',
  httpOnly: true,
  secure: env.isProd,
  sameSite: 'Lax' as const,
  maxAge: 600,
}

const REFRESH_COOKIE = 'refreshToken'
const setRefreshCookie = (c: Context, raw: string) =>
  setCookie(c, REFRESH_COOKIE, raw, {
    path: '/api/social/login',
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'Lax',
    maxAge: REFRESH_TOKEN_TTL,
  })

login.get('/google', async (c) => {
  if (!googleReady) return fail(c, 'NOT_CONFIGURED', 'GOOGLE_* 환경변수 없음', 503)
  const { url, state, nonce, codeVerifier } = await authUrl()
  const saved = JSON.stringify({ state, nonce, codeVerifier })
  await setSignedCookie(c, OAUTH_COOKIE, saved, env.cookieSecret, oauthCookieOpts)
  return c.redirect(url, 302)
})

// 첫 방문이면 가입, 이미 있으면 로그인. 둘 다 { token, user }
login.get('/google/callback', async (c) => {
  if (!googleReady) return fail(c, 'NOT_CONFIGURED', 'GOOGLE_* 환경변수 없음', 503)
  const { code, state, error } = c.req.query()
  const saved = await getSignedCookie(c, env.cookieSecret, OAUTH_COOKIE)
  deleteCookie(c, OAUTH_COOKIE, { path: '/api/social/login/google' })

  if (error) return fail(c, 'GOOGLE_DENIED', `구글 로그인 취소: ${error}`, 400)
  if (!code || !state || !saved) return fail(c, 'INVALID_INPUT', '잘못된 콜백', 400)
  const s = JSON.parse(saved) as { state: string; nonce: string; codeVerifier: string }
  if (s.state !== state) return fail(c, 'INVALID_INPUT', 'state 불일치', 400)

  const { id_token } = await exchangeCode(code, s.codeVerifier)
  const profile = await verifyIdToken(id_token, s.nonce)
  if (!profile.emailVerified) return fail(c, 'FORBIDDEN', '인증 안 된 구글 이메일', 403)

  const u = await findOrCreateUser(profile)
  const { token, refreshToken } = await issueTokens(u)
  setRefreshCookie(c, refreshToken)

  return c.redirect(`${env.frontendUrl}/auth/callback?token=${encodeURIComponent(token)}`, 302)
})

// body에 refreshToken(refresh_token) 없으면 쿠키에서
login.post('/refresh', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const fromBody = body.refreshToken ?? body.refresh_token
  const raw = typeof fromBody === 'string' && fromBody ? fromBody : getCookie(c, REFRESH_COOKIE)
  if (!raw) return fail(c, 'UNAUTHORIZED', '리프레시 토큰 만료 또는 무효', 401)

  const { token, refreshToken } = await rotate(raw)
  setRefreshCookie(c, refreshToken)
  return ok(c, { token })
})

login.post('/logout', requireAuth, async (c) => {
  await db.delete(refreshTokenTable).where(eq(refreshTokenTable.userId, c.get('userId')))
  deleteCookie(c, REFRESH_COOKIE, { path: '/api/social/login' })
  return c.body(null, 204)
})

// 테스트용. 구글 없이 주소만 쳐서 토큰 받기. ENABLE_DEV_TOKEN="true" 일 때만 열림
// ?user_id=1 이면 그 유저, 없으면 테스트 계정(dev-user) 하나 만들어서 씀
login.get('/dev-token', async (c) => {
  if (!env.devTokenEnabled) return fail(c, 'NOT_FOUND', '없는 경로', 404)

  const userId = c.req.query('user_id')
  const u = userId
    ? await users.findById(Number(userId))
    : await findOrCreateUser({
        sub: 'dev-user',
        email: 'dev-user@codegram.local',
      })
  if (!u) return fail(c, 'NOT_FOUND', '없는 사용자', 404)

  const { token, refreshToken, user } = await issueTokens(u)
  setRefreshCookie(c, refreshToken)
  return ok(c, { token, refreshToken, user })
})
