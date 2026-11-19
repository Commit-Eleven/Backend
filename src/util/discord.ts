import { truncate } from './text'

// 디스코드 웹훅 주소만 허용한다. 아무 주소로나 요청을 보내지 않게 막는 용도
const WEBHOOK_PATTERN = /^https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/
const TIMEOUT_MS = 5000
const DESCRIPTION_MAX = 1500

export type DiscordEmbed = {
  title: string
  description?: string
  color?: number
  fields?: { name: string; value: string; inline?: boolean }[]
}

export function isDiscordWebhook(url: string): boolean {
  return WEBHOOK_PATTERN.test(url)
}

export const DISCORD_COLOR = { green: 0x2ecc71, red: 0xe74c3c, blue: 0x3498db }

// 실패해도 서비스 동작에는 영향이 없어야 해서 예외 대신 성공 여부만 돌려준다
export async function sendDiscord(url: string, embed: DiscordEmbed): Promise<boolean> {
  if (!isDiscordWebhook(url)) return false
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // 멘션이 실제로 울리지 않게 한다
      body: JSON.stringify({
        username: 'Codegram',
        allowed_mentions: { parse: [] },
        embeds: [
          {
            ...embed,
            description: embed.description && truncate(embed.description, DESCRIPTION_MAX),
          },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return response.ok
  } catch (e) {
    console.error('[discord] 전송 실패', e)
    return false
  }
}
