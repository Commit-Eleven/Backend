import mysql from 'mysql2/promise'

const pool = mysql.createPool({
  host: Bun.env.DB_HOST ?? 'localhost',
  port: Number(Bun.env.DB_PORT ?? 3306),
  user: Bun.env.DB_USER,
  password: Bun.env.DB_PASSWORD,
  database: Bun.env.DB_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
})

export { pool }