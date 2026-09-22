import { verifyWithJwks } from 'hono/jwt'
import { env } from './env'

// 구글 OAuth: 동의 화면 URL 만들기 → code 를 토큰으로 교환 → id_token 검증

const { clientId, clientSecret, redirectUri } = env.google

// 셋 다 있어야 구글 로그인 켜짐. 없으면 /auth/google 이 503
export const googleReady = !!(clientId && clientSecret && redirectUri)

// state/nonce/PKCE 용 랜덤값이랑 해시
const b64url = (b: Uint8Array) => Buffer.from(b).toString('base64url')
const random = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)))
const sha256 = async (s: string) =>
  b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))))

// state는 CSRF, nonce는 id_token 재사용, PKCE는 code 가로채기 막는 용도
export async function authUrl() {
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
export async function exchangeCode(code: string, codeVerifier: string) {
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
export type GoogleProfile = { sub: string; email: string; emailVerified: boolean }

// 구글 공개키로 서명 확인하고 iss/aud/exp는 verifyWithJwks가 보고 nonce는 직접 비교
export async function verifyIdToken(idToken: string, nonce: string): Promise<GoogleProfile> {
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
