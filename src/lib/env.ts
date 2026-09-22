// 환경변수는 여기서만
export const env = {
  port: Number(Bun.env.PORT ?? 3000),
  db: {
    host: Bun.env.DB_HOST ?? 'localhost',
    port: Number(Bun.env.DB_PORT ?? 3306),
    user: Bun.env.DB_USER,
    password: Bun.env.DB_PASSWORD,
    database: Bun.env.DB_DATABASE,
  },
  jwtSecret: Bun.env.JWT_SECRET ?? 'dev-only-secret-change-me',
  google: {
    clientId: Bun.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: Bun.env.GOOGLE_CLIENT_SECRET ?? '',
    redirectUri: Bun.env.GOOGLE_REDIRECT_URI ?? '',
  },
  // 개발용 로그인 스위치
  allowDevLogin: Bun.env.ALLOW_DEV_LOGIN === 'true',
} as const
