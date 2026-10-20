import { Hono } from 'hono'
import { STUDY_LANGUAGE, STUDY_LEVEL } from '../../util/config/constants'
import { users } from '../../util/db/users'
import { type AuthEnv, requireAuth } from '../../util/http/auth'
import { toCamelCase } from '../../util/http/case'
import { Errors, ok } from '../../util/http/response'

// 첫 로그인 때 한 번만 하는 온보딩. 배울 언어랑 수준을 고른다
export const onboarding = new Hono<AuthEnv>()

type Language = (typeof STUDY_LANGUAGE)[number]
type Level = (typeof STUDY_LEVEL)[number]

// 화면에 뿌릴 선택지. 이미지는 프론트가 가진 걸 씀
const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'html_css', label: 'HTML/CSS' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'java', label: 'Java' },
  { id: 'python', label: 'Python' },
]

const LEVELS: { id: Level; label: string; description: string }[] = [
  { id: 'beginner', label: '초급', description: '코딩을 처음 배워요' },
  { id: 'intermediate', label: '중급', description: '기본 문법은 알아요' },
  { id: 'advanced', label: '고급', description: '혼자 프로그램을 만들 수 있어요' },
]

const isLanguage = (v: unknown): v is Language => STUDY_LANGUAGE.includes(v as Language)
const isLevel = (v: unknown): v is Level => STUDY_LEVEL.includes(v as Level)

// 온보딩이 필요한지 + 고를 수 있는 목록
onboarding.get('/', requireAuth, async (c) => {
  const u = await users.findById(c.get('userId'))
  if (!u) throw Errors.notFound('없는 사용자')

  return ok(c, {
    required: u.onboardedAt === null,
    languages: LANGUAGES,
    levels: LEVELS,
  })
})

// 고른 값 저장. 이미 한 사람은 409
onboarding.post('/', requireAuth, async (c) => {
  const body = toCamelCase((await c.req.json().catch(() => ({}))) as Record<string, unknown>) as {
    language?: unknown
    level?: unknown
  }
  if (!isLanguage(body.language)) throw Errors.invalidInput('language 값이 잘못됨')
  if (!isLevel(body.level)) throw Errors.invalidInput('level 값이 잘못됨')

  const userId = c.get('userId')
  const u = await users.findById(userId)
  if (!u) throw Errors.notFound('없는 사용자')
  if (u.onboardedAt !== null) throw Errors.duplicate('이미 온보딩을 끝냈음')

  await users.completeOnboarding(userId, body.language, body.level)
  return ok(c, { studyLanguage: body.language, studyLevel: body.level })
})
