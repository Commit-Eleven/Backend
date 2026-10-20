export const env = {
  port: Number(Bun.env.PORT ?? 3000),
  db: {
    host: Bun.env.DB_HOST ?? 'localhost',
    port: Number(Bun.env.DB_PORT ?? 3306),
    user: Bun.env.DB_USER,
    password: Bun.env.DB_PASSWORD,
    database: Bun.env.DB_DATABASE,
  },
  jwtSecret: Bun.env.JWT_SECRET ?? '',
  cookieSecret: Bun.env.COOKIE_SECRET ?? '',
  google: {
    clientId: Bun.env.GOOGLE_CLIENT_ID,
    clientSecret: Bun.env.GOOGLE_CLIENT_SECRET,
    redirectUri: Bun.env.GOOGLE_REDIRECT_URI,
  },
  frontendUrl: Bun.env.FRONTEND_URL || undefined,
  isProd: Bun.env.NODE_ENV === 'production',
  devTokenEnabled: Bun.env.ENABLE_DEV_TOKEN === 'true' && Bun.env.NODE_ENV !== 'production',
} as const
