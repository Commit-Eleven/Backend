import { Hono } from "hono"
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise"
import { pool } from "../../db"
import { type JwtEnv, requireAuth } from "../auth/jwt"
import { normalizeNickname, randomTag } from "../auth/nickname"

const users = new Hono<JwtEnv>()

// 닉네임 바꾸면 태그도 새로 뽑음. 태그는 전체에서 안 겹치게
users.patch("/nickname", requireAuth, async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { nickname?: unknown }
    const nickname = normalizeNickname(body.nickname)
    if (!nickname) return c.json({ error: "INVALID_INPUT", message: "닉네임은 2~20자" }, 400)

    const userId = c.get("userId")
    for (let i = 0; i < 20; i++) {
        const tag = randomTag()
        const [taken] = await pool.query<RowDataPacket[]>("SELECT id FROM `user` WHERE tag = ?", [tag])
        if (taken.length) continue
        try {
            const [r] = await pool.query<ResultSetHeader>(
                "UPDATE `user` SET nickname = ?, tag = ? WHERE id = ?",
                [nickname, tag, userId],
            )
            if (r.affectedRows === 0) return c.json({ error: "NOT_FOUND", message: "없는 사용자" }, 404)
            return c.json({ nickname, tag })
        } catch (e) {
            // 확인하고 바꾸는 사이에 누가 같은 태그를 먼저 가져간 경우
            if ((e as { code?: string }).code === "ER_DUP_ENTRY") continue
            throw e
        }
    }
    return c.json({ error: "INTERNAL", message: "태그 생성 실패" }, 500)
})

export default users
