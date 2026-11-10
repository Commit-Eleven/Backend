import { Hono } from 'hono'
import { AVATAR_URL_MAX_LENGTH } from '../../util/config/constants'
import { users } from '../../util/db/users'
import { type AuthEnv, requireAuth } from '../../util/http/auth'
import { toCamelCase } from '../../util/http/case'
import { Errors, ok } from '../../util/http/response'

export const avatar = new Hono<AuthEnv>()

// http, https 주소만 받는다
function isImageUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

// 프로필 사진 변경. 업로드한 이미지 주소를 저장한다. null 이나 "" 를 보내면 기본 사진으로 돌린다
avatar.patch('/', requireAuth, async (c) => {
  const raw = await c.req.json().catch(() => null)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw Errors.invalidInput('JSON 본문이 필요함')
  }
  // 명세는 imageUrl, 프론트는 avatar_url 로 보내서 둘 다 받는다
  const body = toCamelCase(raw as Record<string, unknown>) as {
    imageUrl?: unknown
    avatarUrl?: unknown
  }
  const input = body.imageUrl !== undefined ? body.imageUrl : body.avatarUrl
  if (input === undefined) throw Errors.invalidInput('imageUrl 을 보내야 함')

  let avatarUrl: string | null
  if (input === null || input === '') {
    avatarUrl = null
  } else if (typeof input === 'string') {
    avatarUrl = input.trim()
    if (avatarUrl.length > AVATAR_URL_MAX_LENGTH) {
      throw Errors.invalidInput(`imageUrl 은 ${AVATAR_URL_MAX_LENGTH}자 이하`)
    }
    if (!isImageUrl(avatarUrl)) throw Errors.invalidInput('imageUrl 은 http 나 https 주소')
  } else {
    throw Errors.invalidInput('imageUrl 은 문자열이나 null')
  }

  const userId = c.get('userId')
  if (!(await users.findById(userId))) throw Errors.notFound('없는 사용자')
  await users.updateAvatar(userId, avatarUrl)
  return ok(c, { avatarUrl })
})
