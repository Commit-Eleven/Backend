import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export const ok = (c: Context, data: unknown, status: ContentfulStatusCode = 200) =>
  c.json({ success: true, data }, status)

export const fail = (
  c: Context,
  code: string,
  message: string,
  status: ContentfulStatusCode = 400,
) => c.json({ success: false, error: { code, message } }, status)
