import { type Context, Hono } from 'hono'
import {
  avatarFileInfo,
  removeAvatarFile,
  saveAvatar,
  validateAvatarImage,
} from '../../util/avatar'
import {
  AVATAR_MULTIPART_OVERHEAD_BYTES,
  AVATAR_UPLOAD_MAX_BYTES,
  AVATAR_URL_MAX_LENGTH,
} from '../../util/config/constants'
import { users } from '../../util/db/users'
import { type AuthEnv, requireAuth } from '../../util/http/auth'
import { readBinaryBody } from '../../util/http/body'
import { toCamelCase } from '../../util/http/case'
import { Errors, ok } from '../../util/http/response'

export const avatar = new Hono<AuthEnv>()

// 요청 전체 한도. multipart 경계와 헤더가 붙으므로 파일 한도보다 조금 넉넉하게 잡는다
export const AVATAR_REQUEST_MAX_BYTES = AVATAR_UPLOAD_MAX_BYTES + AVATAR_MULTIPART_OVERHEAD_BYTES

// http, https 주소만 받는다
function isImageUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

// 프로필 사진 변경.
// - multipart/form-data 의 image 파일을 받아 서버에 저장한다
// - JSON 의 imageUrl 은 기존 클라이언트 호환용으로 남겨 둔다. null 이나 "" 면 기본 사진
avatar.patch('/', requireAuth, async (c) => {
  const contentType = c.req.header('content-type') ?? ''
  if (contentType.toLowerCase().startsWith('multipart/form-data')) {
    return uploadAvatar(c)
  }
  return updateAvatarUrl(c)
})

async function uploadAvatar(c: Context<AuthEnv>) {
  const contentType = c.req.header('content-type') ?? ''
  // Content-Length 를 속여도 실제로 읽은 바이트로 다시 제한한다
  const bytes = await readBinaryBody(c, AVATAR_REQUEST_MAX_BYTES)

  let form: FormData
  try {
    const body = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer
    form = await new Response(body, { headers: { 'content-type': contentType } }).formData()
  } catch {
    throw Errors.invalidInput('multipart/form-data 형식이 올바르지 않습니다')
  }

  const entry = form.get('image') ?? form.get('avatar') ?? form.get('file')
  if (!(entry instanceof File)) throw Errors.invalidInput('image 파일을 보내야 합니다')
  if (entry.size > AVATAR_UPLOAD_MAX_BYTES) {
    throw Errors.tooLarge('프로필 사진은 2MB 이하여야 합니다')
  }

  const data = new Uint8Array(await entry.arrayBuffer())
  const type = validateAvatarImage(data)

  const userId = c.get('userId')
  const user = await users.findById(userId)
  if (!user) throw Errors.notFound('없는 사용자')

  const avatarUrl = await saveAvatar(data, type)
  try {
    await users.updateAvatar(userId, avatarUrl)
  } catch (err) {
    await removeAvatarFile(avatarUrl)
    throw err
  }
  await removeAvatarFile(user.avatarUrl)
  return ok(c, { avatarUrl })
}

async function updateAvatarUrl(c: Context<AuthEnv>) {
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
  const user = await users.findById(userId)
  if (!user) throw Errors.notFound('없는 사용자')
  await users.updateAvatar(userId, avatarUrl)
  await removeAvatarFile(user.avatarUrl)
  return ok(c, { avatarUrl })
}

// 업로드한 사진 제공. 파일 이름은 서버가 만든 무작위 이름만 허용해 경로 조작을 막는다
export const avatars = new Hono()

avatars.get('/:file', async (c) => {
  const info = avatarFileInfo(c.req.param('file'))
  if (!info) throw Errors.notFound('없는 이미지')

  const file = Bun.file(info.path)
  if (!(await file.exists())) throw Errors.notFound('없는 이미지')

  return new Response(file, {
    headers: {
      'Content-Type': info.mime,
      'Content-Length': String(file.size),
      // 내용이 바뀌지 않는 무작위 파일 이름이라 오래 캐시해도 된다
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})
