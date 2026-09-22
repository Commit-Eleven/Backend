import type { Context } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import { createMiddleware } from "hono/factory"
import { sign, verify } from "hono/jwt"
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise"
import { pool } from "../../db"
import type { User } from "../../schema"

// 액세스 토큰 서명 키
const SECRET = Bun.env.JWT_SECRET ?? ""
if (SECRET.length < 32) throw new Error("JWT_SECRET 32자 이상 필요")

const ACCESS_TTL = 60 * 15 // 15분
const REFRESH_TTL = 60 * 60 * 24 * 14 // 14일
const COOKIE = "refreshToken" // 리프레시 토큰 쿠키 이름

// requireAuth 통과하면 c.get('userId'), c.get('tier') 로 꺼내 씀
export type JwtEnv = { Variables: { userId: number; tier: string } }

// 리프레시 토큰 원문은 DB에 안 두고 해시만 저장함
const sha256 = async (s: string) =>
    Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))).toString("hex")

// 액세스 토큰. sub=유저 id, 15분 만료
const accessToken = (u: User) => {
    const iat = Math.floor(Date.now() / 1000)
    return sign({ sub: u.id, tier: u.tier, iat, exp: iat + ACCESS_TTL }, SECRET, "HS256")
}

// 리프레시 토큰은 해시만 DB에, 원문은 httpOnly 쿠키로
const newRefreshToken = async (c: Context, userId: number) => {
    const raw = Buffer.from(crypto.getRandomValues(new Uint8Array(48))).toString("base64url")
    await pool.query(
        "INSERT INTO refresh_token (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
        [userId, await sha256(raw), new Date(Date.now() + REFRESH_TTL * 1000)],
    )
    setCookie(c, COOKIE, raw, {
        path: "/auth",
        httpOnly: true,
        secure: Bun.env.NODE_ENV === "production",
        sameSite: "Lax",
        maxAge: REFRESH_TTL,
    })
}

// 로그인 응답. 액세스 토큰은 body로, 리프레시는 쿠키로
export async function issueTokens(c: Context, u: User) {
    const [token] = await Promise.all([accessToken(u), newRefreshToken(c, u.id)])
    return { token, user: { id: u.id, nickname: u.nickname, tag: u.tag, totalExp: u.total_exp, tier: u.tier } }
}

// 쿠키에 있는 리프레시 토큰 꺼냄
export const readRefreshToken = (c: Context) => getCookie(c, COOKIE) ?? null

// 한 번 쓴 리프레시 토큰은 지우고 새로 발급함
export async function rotateRefreshToken(c: Context, raw: string) {
    const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT id, user_id, expires_at FROM refresh_token WHERE token_hash = ?",
        [await sha256(raw)],
    )
    const row = rows[0]
    if (!row) return null
    await pool.query("DELETE FROM refresh_token WHERE id = ?", [row.id])
    if (new Date(row.expires_at).getTime() < Date.now()) return null

    const [users] = await pool.query<RowDataPacket[]>("SELECT * FROM `user` WHERE id = ?", [row.user_id])
    const u = users[0] as User | undefined
    if (!u) return null
    const [token] = await Promise.all([accessToken(u), newRefreshToken(c, u.id)])
    return token
}

// 로그아웃. DB 행 지우고 쿠키도 비움
export async function revokeRefreshTokens(c: Context, userId: number) {
    await pool.query<ResultSetHeader>("DELETE FROM refresh_token WHERE user_id = ?", [userId])
    deleteCookie(c, COOKIE, { path: "/auth" })
}

// Authorization: Bearer <token>
export const requireAuth = createMiddleware<JwtEnv>(async (c, next) => {
    const header = c.req.header("Authorization") ?? ""
    const token = header.startsWith("Bearer ") ? header.slice(7) : ""
    let payload
    try {
        payload = token ? await verify(token, SECRET, "HS256") : null
    } catch {
        payload = null
    }
    if (!payload || typeof payload.sub !== "number") {
        return c.json({ error: "UNAUTHORIZED", message: "로그인 필요" }, 401)
    }
    c.set("userId", payload.sub)
    c.set("tier", String(payload.tier))
    await next()
})
