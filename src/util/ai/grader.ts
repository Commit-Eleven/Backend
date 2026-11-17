import { env } from '../config/env'

type GradeInput = {
  question: string
  description?: string
  code?: string
  answer: string
  acceptedAnswers: string[]
}

type AnthropicResponse = {
  content?: Array<{ type?: string; text?: string }>
}

export async function gradeShortAnswer(input: GradeInput): Promise<boolean | null> {
  if (!env.anthropicApiKey) return null

  const prompt = [
    '당신은 프로그래밍 학습 사이트의 채점기입니다.',
    '학생 답안이 정답 후보와 의미적으로 같은지 판단하세요.',
    '대소문자, 띄어쓰기, 표현 방식이 달라도 의미가 같으면 correct=true입니다.',
    '문제에서 요구한 핵심이 빠졌거나 다른 개념이면 correct=false입니다.',
    '설명하지 말고 JSON 객체 하나만 반환하세요. 형식: {"correct":true} 또는 {"correct":false}',
    '',
    '[문제]',
    input.question,
    input.description ? '설명: ' + input.description : '',
    input.code ? '코드 문맥:\n' + input.code : '',
    '',
    '[정답 후보]\n' + input.acceptedAnswers.join('\n'),
    '',
    '[학생 답안]\n' + input.answer,
  ]
    .filter(Boolean)
    .join('\n')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.anthropicModel,
      max_tokens: 64,
      temperature: 0,
      system: '반드시 JSON만 반환하세요.',
      messages: [{ role: 'user', content: prompt }],
    }),
  }).catch(() => null)

  if (!response?.ok) return null

  const payload = (await response.json().catch(() => null)) as AnthropicResponse | null
  const text = payload?.content
    ?.filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
  if (!text) return null

  const json = text.match(/\{[\s\S]*\}/)?.[0]
  if (!json) return null

  try {
    const parsed = JSON.parse(json) as { correct?: unknown }
    return typeof parsed.correct === 'boolean' ? parsed.correct : null
  } catch {
    return null
  }
}
