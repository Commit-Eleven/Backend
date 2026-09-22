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
  // 구글 갔다 올 동안 들고 있는 state 쿠키 서명용
  cookieSecret: Bun.env.COOKIE_SECRET ?? 'dev-only-cookie-secret-change-me',
  // 구글 클라우드 콘솔 > 사용자 인증 정보 > OAuth 클라이언트에서 받은 값
  google: {
    clientId: Bun.env.GOOGLE_CLIENT_ID,
    clientSecret: Bun.env.GOOGLE_CLIENT_SECRET,
    redirectUri: Bun.env.GOOGLE_REDIRECT_URI,
  },
  // 있으면 구글 콜백이 여기로 토큰 실어서 리다이렉트, 없으면 JSON 응답
  frontendUrl: Bun.env.FRONTEND_URL || undefined,
  isProd: Bun.env.NODE_ENV === 'production',
} as const
