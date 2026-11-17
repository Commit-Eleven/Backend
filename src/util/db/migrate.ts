import { migrate } from 'drizzle-orm/mysql2/migrator'
import { db } from './connection'

// 마이그레이션이 실패했는데 서버만 정상 기동하면 스키마가 어긋난 채로 요청을 받게 된다.
// 그런 상태를 막기 위해 로그를 남기고 기동을 중단한다.
export async function runMigrations() {
  try {
    await migrate(db, { migrationsFolder: './drizzle' })
  } catch (e) {
    console.error('[db] Migration failed', e)
    throw e
  }
}
