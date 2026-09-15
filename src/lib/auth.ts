import { createMiddleware } from 'hono/factory'

export type AuthEnv = { Variables: { userId: number } }

// TODO: JWT로 교체
export const mockAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const raw = c.req.header('x-user-id')
  const id = Number(raw)
  if (!raw || Number.isNaN(id)) {
    return c.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'x-user-id 헤더 필요' } },
      401,
    )
  }
  c.set('userId', id)
  await next()
})
