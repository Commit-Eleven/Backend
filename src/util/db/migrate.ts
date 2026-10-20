import { migrate } from 'drizzle-orm/mysql2/migrator'
import { db } from './connection'

// 서버 켤 때 drizzle 폴더의 마이그레이션을 적용한다.
// 이미 적용된 건 건너뛰므로 몇 번 켜도 괜찮다.
// 이게 없으면 코드에만 컬럼이 있고 DB 에는 없어서 "Unknown column" 으로 터진다.
export async function runMigrations() {
  try {
    await migrate(db, { migrationsFolder: './drizzle' })
    console.log('[db] 마이그레이션 적용 완료')
  } catch (e) {
    // DB 가 꺼져 있거나 권한이 없는 경우. 서버는 띄우되 눈에 띄게 남긴다
    console.error('[db] 마이그레이션 실패 — DB 설정을 확인하세요', e)
  }
}
