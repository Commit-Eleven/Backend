import { migrate } from 'drizzle-orm/mysql2/migrator'
import { db } from './connection'

export async function runMigrations() {
  try {
    await migrate(db, { migrationsFolder: './drizzle' })
  } catch (e) {
    console.error('[db] Migration failed', e)
  }
}
