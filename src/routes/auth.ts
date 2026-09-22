import { Hono } from 'hono'
import { env } from '../lib/env'
import { Errors } from '../lib/errors'
import { fail, ok } from '../lib/response'
import { userRepository } from '../repositories/userRepository'
import { authService, buildGoogleAuthUrl, exchangeGoogleCode } from '../services/authService'

export const auth = new Hono()

// 구글 동의 화면으로 리다이렉트
auth.get('/auth/google', (c) => {
  const state = crypto.randomUUID()
  return c.redirect(buildGoogleAuthUrl(state))
})

// 구글 콜백 하나로 회원가입 + 로그인 둘 다 처리. 응답 형태는 동일.
auth.get('/auth/google/callback', async (c) => {
  const code = c.req.query('code')
  if (!code) return fail(c, 'INVALID_INPUT', 'code 파라미터 필요', 400)

  const profile = await exchangeGoogleCode(code)
  const { user } = await authService.findOrCreateGoogleUser(profile)
  const token = await authService.issueToken(user.id)

  return ok(c, {
    token,
    user: {
      id: user.id,
      nickname: user.nickname,
      tag: user.tag,
      totalExp: user.totalExp,
    },
  })
})

// 로컬 개발 전용: 구글 없이 바로 토큰 발급. ALLOW_DEV_LOGIN=true일 때만 열림.
auth.post('/auth/dev-login', async (c) => {
  if (!env.allowDevLogin) throw Errors.notFound()

  const body = (await c.req.json().catch(() => ({}))) as { userId?: number }
  if (!body.userId) return fail(c, 'INVALID_INPUT', 'userId 필요', 400)

  const user = await userRepository.findById(body.userId)
  if (!user) return fail(c, 'NOT_FOUND', '없는 유저', 404)

  const token = await authService.issueToken(user.id)
  return ok(c, {
    token,
    user: { id: user.id, nickname: user.nickname, tag: user.tag, totalExp: user.totalExp },
  })
})
