// 서버가 동작하려면 반드시 있어야 하는 값. 없으면 빈 키로 서명하다가 런타임에
// 원인을 찾기 어려운 실패가 나므로, 기동 시점에 바로 알려준다.
function required(name: string): string {
  const value = Bun.env[name]
  if (!value) throw new Error(`환경변수 ${name} 가 없습니다. .env.example 을 참고하세요.`)
  return value
}

export const env = {
  port: Number(Bun.env.PORT ?? 3000),
  db: {
    host: Bun.env.DB_HOST ?? 'localhost',
    port: Number(Bun.env.DB_PORT ?? 3306),
    user: required('DB_USER'),
    password: Bun.env.DB_PASSWORD,
    database: required('DB_DATABASE'),
  },
  jwtSecret: required('JWT_SECRET'),
  cookieSecret: required('COOKIE_SECRET'),
  google: {
    clientId: Bun.env.GOOGLE_CLIENT_ID,
    clientSecret: Bun.env.GOOGLE_CLIENT_SECRET,
    redirectUri: Bun.env.GOOGLE_REDIRECT_URI,
  },
  anthropicApiKey: Bun.env.ANTHROPIC_API_KEY ?? '',
  anthropicModel: Bun.env.ANTHROPIC_MODEL ?? 'claude-3-5-haiku-latest',
  // OAuth callback must return the browser to the app instead of rendering the token JSON.
  // Local development can override this with http://127.0.0.1:5173.
  frontendUrl: (Bun.env.FRONTEND_URL || 'https://codegram.me').replace(/\/+$/, ''),
  isProd: Bun.env.NODE_ENV === 'production',
  // 개발용 토큰은 NODE_ENV 가 명시적으로 development 일 때만 연다.
  // production 이 아닌 값(미설정 포함)에서 실수로 열리지 않게 하기 위함이다.
  devTokenEnabled: Bun.env.ENABLE_DEV_TOKEN === 'true' && Bun.env.NODE_ENV === 'development',
} as const
