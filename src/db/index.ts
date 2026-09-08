import { drizzle } from 'drizzle-orm/mysql2'
import mysql from 'mysql2/promise'
import * as schema from './schema'

export const pool = mysql.createPool({
  host: Bun.env.DB_HOST ?? 'localhost',
  port: Number(Bun.env.DB_PORT ?? 3306),
  user: Bun.env.DB_USER,
  password: Bun.env.DB_PASSWORD,
  database: Bun.env.DB_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
})

export const db = drizzle(pool, { schema, mode: 'default' })

export { schema }
