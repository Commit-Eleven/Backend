import { randomBytes } from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { AVATAR_MAX_DIMENSION } from './config/constants'
import { env } from './config/env'
import { Errors } from './http/response'

// 업로드한 사진의 공개 주소. DB 에는 이 접두사가 붙은 상대 경로만 저장한다
export const AVATAR_URL_PREFIX = '/api/avatars/'
const AVATAR_FILE_NAME = /^[a-f0-9]{32}\.(png|jpg|webp)$/

type ImageType = { ext: 'png' | 'jpg' | 'webp'; mime: string }

const MIME_BY_EXT: Record<ImageType['ext'], string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
}

// 업로드 파일은 이름과 Content-Type 을 믿지 않고 시그니처(매직 바이트)로만 판별한다.
// SVG 는 스크립트를 품을 수 있어서 허용하지 않는다.
export function detectImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { ext: 'png', mime: MIME_BY_EXT.png }
  }
  if (startsWith(bytes, 0, [0xff, 0xd8, 0xff])) {
    return { ext: 'jpg', mime: MIME_BY_EXT.jpg }
  }
  if (startsWith(bytes, 0, [0x52, 0x49, 0x46, 0x46]) && ascii(bytes, 8, 4) === 'WEBP') {
    return { ext: 'webp', mime: MIME_BY_EXT.webp }
  }
  return null
}

// 이미지 헤더에서 가로·세로를 읽는다. 압축 폭탄을 막으려고 크기를 확인한다
export function imageSize(
  bytes: Uint8Array,
  ext: ImageType['ext'],
): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (ext === 'png') {
    if (bytes.byteLength < 24) return null
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }
  if (ext === 'jpg') return jpegSize(view)
  return webpSize(bytes, view)
}

// 파일 형식·크기를 확인하고 저장할 확장자를 돌려준다
export function validateAvatarImage(bytes: Uint8Array): ImageType {
  if (bytes.byteLength === 0) throw Errors.invalidInput('빈 파일은 업로드할 수 없습니다')
  const type = detectImageType(bytes)
  if (!type) throw Errors.invalidInput('PNG, JPEG, WebP 이미지만 업로드할 수 있습니다')

  const size = imageSize(bytes, type.ext)
  if (!size || size.width < 1 || size.height < 1) {
    throw Errors.invalidInput('이미지 크기를 확인할 수 없습니다')
  }
  if (size.width > AVATAR_MAX_DIMENSION || size.height > AVATAR_MAX_DIMENSION) {
    throw Errors.invalidInput(`이미지는 가로·세로 ${AVATAR_MAX_DIMENSION}px 이하여야 합니다`)
  }
  return type
}

// 원본 파일 이름을 쓰지 않고 무작위 이름으로 저장한다. 같은 이름 덮어쓰기·경로 조작을 피하기 위함이다
export async function saveAvatar(bytes: Uint8Array, type: ImageType): Promise<string> {
  await mkdir(env.avatarDir, { recursive: true })
  const fileName = `${randomBytes(16).toString('hex')}.${type.ext}`
  await Bun.write(join(env.avatarDir, fileName), bytes, { mode: 0o644 })
  return `${AVATAR_URL_PREFIX}${fileName}`
}

// 내가 올린 사진일 때만 지운다. 외부 주소나 null 은 건드리지 않는다
export async function removeAvatarFile(avatarUrl: string | null): Promise<void> {
  if (!avatarUrl?.startsWith(AVATAR_URL_PREFIX)) return
  const fileName = avatarUrl.slice(AVATAR_URL_PREFIX.length)
  if (!AVATAR_FILE_NAME.test(fileName)) return
  await rm(join(env.avatarDir, fileName), { force: true })
}

// /api/avatars/:file 로 내보낼 때 쓰는 안전한 이름인지 확인한다
export function avatarFileInfo(fileName: string): { path: string; mime: string } | null {
  const match = AVATAR_FILE_NAME.exec(fileName)
  if (!match) return null
  const ext = match[1] as ImageType['ext']
  return { path: join(env.avatarDir, fileName), mime: MIME_BY_EXT[ext] }
}

function startsWith(bytes: Uint8Array, offset: number, expected: number[]): boolean {
  if (bytes.byteLength < offset + expected.length) return false
  return expected.every((value, i) => bytes[offset + i] === value)
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  if (bytes.byteLength < offset + length) return ''
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}

function jpegSize(view: DataView): { width: number; height: number } | null {
  let offset = 2
  while (offset + 9 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return null
    const marker = view.getUint8(offset + 1)
    // 시작/재시작 마커는 길이 필드가 없다
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }
    if (marker === 0xd8 || marker === 0x00 || marker === 0xff) {
      offset += 2
      continue
    }
    if (marker === 0xd9 || marker === 0xda) return null
    const segmentLength = view.getUint16(offset + 2)
    if (segmentLength < 2) return null
    // SOF0~SOF15 중 DHT(C4), JPG(C8), DAC(CC) 는 크기 정보가 아니다
    const isSizeMarker =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isSizeMarker) {
      return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) }
    }
    offset += 2 + segmentLength
  }
  return null
}

function webpSize(bytes: Uint8Array, view: DataView): { width: number; height: number } | null {
  const chunk = ascii(bytes, 12, 4)
  if (chunk === 'VP8 ') {
    if (view.byteLength < 30) return null
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    }
  }
  if (chunk === 'VP8L') {
    if (view.byteLength < 25 || view.getUint8(20) !== 0x2f) return null
    const bits = view.getUint32(21, true)
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
  }
  if (chunk === 'VP8X') {
    if (view.byteLength < 30) return null
    const width = view.getUint8(24) | (view.getUint8(25) << 8) | (view.getUint8(26) << 16)
    const height = view.getUint8(27) | (view.getUint8(28) << 8) | (view.getUint8(29) << 16)
    return { width: width + 1, height: height + 1 }
  }
  return null
}
