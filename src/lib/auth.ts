import { createMiddleware } from 'hono/factory'
import { verify } from 'hono/jwt'
import { env } from './env'
import { fail } from './response'

export type AuthEnv = { Variables: { userId: number } }

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const header = c.req.header('authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return fail(c, 'UNAUTHORIZED', '토큰 필요', 401)

  try {
    const payload = await verify(token, env.jwtSecret, 'HS256')
    c.set('userId', Number(payload.sub))
    await next()
  } catch {
    return fail(c, 'UNAUTHORIZED', '유효하지 않거나 만료된 토큰', 401)
  }
})
