// 환경변수는 여기서만 읽는다. 다른 파일에서 Bun.env 직접 참조 금지.
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
  // 구글 OAuth 없이 로컬에서 토큰 발급받는 /auth/dev-login 활성화 여부. 운영에선 false.
  allowDevLogin: Bun.env.ALLOW_DEV_LOGIN === 'true',
} as const
