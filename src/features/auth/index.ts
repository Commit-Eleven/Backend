import { Hono } from "hono"
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie"
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise"
import { pool } from "../../db"
import { authUrl, exchangeCode, googleReady, type GoogleProfile, verifyIdToken } from "./google"
import { issueTokens, type JwtEnv, readRefreshToken, requireAuth, revokeRefreshTokens, rotateRefreshToken } from "./jwt"
import { ensureAuthTables, type User } from "../../schema"
import { randomNickname, randomTag } from "./nickname"

await ensureAuthTables()

// 가입/로그인은 구글로만. 이메일·비밀번호 계정 없음
const auth = new Hono<JwtEnv>()

// state 쿠키 서명용. 없거나 짧으면 서버 안 띄움
const COOKIE_SECRET = Bun.env.COOKIE_SECRET ?? ""
if (COOKIE_SECRET.length < 32) throw new Error("COOKIE_SECRET 32자 이상 필요")

// FRONTEND_URL 있으면 콜백에서 프론트로 넘김. 프로덕션에서만 쿠키에 Secure
const FRONTEND_URL = Bun.env.FRONTEND_URL
const isProd = Bun.env.NODE_ENV === "production"

// JSON body 파싱. 깨졌거나 비어 있으면 빈 객체
const body = <T>(c: { req: { json: () => Promise<T> } }) => c.req.json().catch(() => ({}) as T)

// user 한 줄 조회. where 절이랑 파라미터만 넘김
const findUser = async (where: string, params: unknown[]) => {
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM \`user\` WHERE ${where}`, params)
    return rows[0] as User | undefined
}

// 구글 갔다 올 동안 state/nonce/verifier 들고 있을 쿠키 (10분) 
const OAUTH_COOKIE = "g_oauth"
const oauthCookieOpts = { path: "/auth/google", httpOnly: true, secure: isProd, sameSite: "Lax" as const, maxAge: 600 }

// 구글 동의 화면으로 보냄
auth.get("/google", async (c) => {
    if (!googleReady) return c.json({ error: "NOT_CONFIGURED", message: "GOOGLE_* 환경변수 없음" }, 503)
    const { url, state, nonce, codeVerifier } = await authUrl()
    await setSignedCookie(c, OAUTH_COOKIE, JSON.stringify({ state, nonce, codeVerifier }), COOKIE_SECRET, oauthCookieOpts)
    return c.redirect(url, 302)
})

// 첫 방문이면 가입, 이미 있으면 로그인. 둘 다 { token, user }
auth.get("/google/callback", async (c) => {
    if (!googleReady) return c.json({ error: "NOT_CONFIGURED", message: "GOOGLE_* 환경변수 없음" }, 503)
    const { code, state, error } = c.req.query()
    const saved = await getSignedCookie(c, COOKIE_SECRET, OAUTH_COOKIE)
    deleteCookie(c, OAUTH_COOKIE, { path: "/auth/google" })

    if (error) return c.json({ error: "GOOGLE_DENIED", message: `구글 로그인 취소: ${error}` }, 400)
    if (!code || !state || !saved) return c.json({ error: "INVALID_INPUT", message: "잘못된 콜백" }, 400)
    const s = JSON.parse(saved) as { state: string; nonce: string; codeVerifier: string }
    if (s.state !== state) return c.json({ error: "INVALID_INPUT", message: "state 불일치" }, 400)

    const { id_token } = await exchangeCode(code, s.codeVerifier)
    const profile = await verifyIdToken(id_token, s.nonce)
    if (!profile.emailVerified) return c.json({ error: "FORBIDDEN", message: "인증 안 된 구글 이메일" }, 403)

    const u = await findOrCreateUser(profile)
    const data = await issueTokens(c, u)

    // 프론트 주소 있으면 토큰 실어서 넘기고, 없으면 그냥 JSON
    if (FRONTEND_URL) return c.redirect(`${FRONTEND_URL}/auth/callback?token=${encodeURIComponent(data.token)}`, 302)
    return c.json(data)
})

// provider_id(구글 sub)로만 식별. 처음 오면 닉네임#태그 랜덤으로 만들어서 가입 닉네임은 중복 허용, 태그는 중복 불가임
export async function findOrCreateUser(p: GoogleProfile): Promise<User> {
    const existing = await findUser("provider = 'google' AND provider_id = ?", [p.sub])
    if (existing) return existing

    const email = p.email.toLowerCase()
    // 태그가 겹치면 다시 뽑음. 유니크 키에 걸려도 재시도함
    for (let i = 0; i < 20; i++) {
        const nickname = randomNickname()
        const tag = randomTag()
        if (await findUser("tag = ?", [tag])) continue
        try {
            const [r] = await pool.query<ResultSetHeader>(
                "INSERT INTO `user` (email, nickname, tag, provider, provider_id) VALUES (?, ?, ?, 'google', ?)",
                [email, nickname, tag, p.sub],
            )
            return (await findUser("id = ?", [r.insertId]))!
        } catch (e) {
            if ((e as { code?: string }).code === "ER_DUP_ENTRY") continue
            throw e
        }
    }
    throw new Error("닉네임 생성 실패")
}

// body에 refreshToken 없으면 쿠키에서
auth.post("/refresh", async (c) => {
    const { refreshToken } = await body<{ refreshToken?: unknown }>(c)
    const raw = typeof refreshToken === "string" && refreshToken ? refreshToken : readRefreshToken(c)
    const token = raw ? await rotateRefreshToken(c, raw) : null
    if (!token) return c.json({ error: "UNAUTHORIZED", message: "리프레시 토큰 만료 또는 무효" }, 401)
    return c.json({ token })
})

// 이 유저 리프레시 토큰 전부 삭제. 액세스 토큰은 만료(15분)까지는 살아 있음
auth.post("/logout", requireAuth, async (c) => {
    await revokeRefreshTokens(c, c.get("userId"))
    return c.body(null, 204)
})

export default auth
