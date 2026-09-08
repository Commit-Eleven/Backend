import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

// 성공 { success:true, data } / 실패 { success:false, error:{ code, message } }
export const ok = (c: Context, data: unknown, status: ContentfulStatusCode = 200) =>
  c.json({ success: true, data }, status)

export const fail = (
  c: Context,
  code: string,
  message: string,
  status: ContentfulStatusCode = 400,
) => c.json({ success: false, error: { code, message } }, status)
