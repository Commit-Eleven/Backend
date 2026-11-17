import { Hono } from 'hono'
import { env } from '../../util/config/env'
import { type AuthEnv, requireAuth } from '../../util/http/auth'
import { readJsonBody } from '../../util/http/body'
import { fail, ok } from '../../util/http/response'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

const MAX_MESSAGES = 20
const MAX_MESSAGE_LENGTH = 20_000
const DEFAULT_MAX_TOKENS = 1_024

function isChatMessages(value: unknown): value is ChatMessage[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= MAX_MESSAGES &&
    value.every(
      (message) =>
        typeof message === 'object' &&
        message !== null &&
        'role' in message &&
        'content' in message &&
        (message as { role: unknown }).role &&
        ((message as { role: unknown }).role === 'user' ||
          (message as { role: unknown }).role === 'assistant') &&
        typeof (message as { content: unknown }).content === 'string' &&
        (message as { content: string }).content.trim().length > 0 &&
        (message as { content: string }).content.length <= MAX_MESSAGE_LENGTH,
    )
  )
}

export const ai = new Hono<AuthEnv>()

ai.post('/chat', requireAuth, async (c) => {
  const body = await readJsonBody(c)
  const messages = body.messages
  const system = body.system
  const requestedMaxTokens = body.max_tokens

  if (!isChatMessages(messages)) {
    return fail(
      c,
      'INVALID_INPUT',
      `messages 는 최대 ${MAX_MESSAGES}개의 user/assistant 메시지 배열이어야 합니다`,
      400,
    )
  }
  if (system !== undefined && (typeof system !== 'string' || system.length > MAX_MESSAGE_LENGTH)) {
    return fail(c, 'INVALID_INPUT', `system 은 ${MAX_MESSAGE_LENGTH}자 이하의 문자열이어야 합니다`, 400)
  }
  if (
    requestedMaxTokens !== undefined &&
    (typeof requestedMaxTokens !== 'number' ||
      !Number.isInteger(requestedMaxTokens) ||
      requestedMaxTokens < 1 ||
      requestedMaxTokens > 4096)
  ) {
    return fail(c, 'INVALID_INPUT', 'max_tokens 는 1에서 4096 사이의 정수여야 합니다', 400)
  }
  if (!env.anthropicApiKey) {
    return fail(c, 'AI_NOT_CONFIGURED', 'Anthropic API 키가 서버에 설정되지 않았습니다', 503)
  }

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.anthropicModel,
      max_tokens: requestedMaxTokens ?? DEFAULT_MAX_TOKENS,
      ...(system ? { system } : {}),
      messages,
    }),
  }).catch(() => null)

  if (!upstream) return fail(c, 'AI_UNAVAILABLE', 'AI 서비스에 연결할 수 없습니다', 503)

  const payload = (await upstream.json().catch(() => null)) as
    | {
        content?: Array<{ type?: string; text?: string }>
        model?: string
        usage?: { input_tokens?: number; output_tokens?: number }
        error?: { message?: string }
      }
    | null

  if (!upstream.ok || !payload) {
    console.error('Anthropic request failed', upstream.status, payload?.error?.message)
    return fail(c, 'AI_REQUEST_FAILED', 'AI 요청을 처리하지 못했습니다', 502)
  }

  const contentText = (payload.content ?? [])
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')

  return ok(c, {
    content: contentText,
    model: payload.model ?? env.anthropicModel,
    usage: payload.usage,
  })
})
