import { pool } from './db'

async function initializeTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS;
    `)

    console.log("[schema] Completed (CREATE TABLE)")
  } catch (error) {
    console.error('[schema] [error] ', error)
  }
}

export { initializeTable }