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
  // OAuth callback must return the browser to the app instead of rendering the token JSON.
  // Local development can override this with http://127.0.0.1:5173.
  frontendUrl: (Bun.env.FRONTEND_URL || 'https://codegram.me').replace(/\/+$/, ''),
  isProd: Bun.env.NODE_ENV === 'production',
  devTokenEnabled: Bun.env.ENABLE_DEV_TOKEN === 'true' && Bun.env.NODE_ENV !== 'production',
} as const
