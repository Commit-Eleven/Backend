// 개발용 시드. bun run scripts/seed.ts  (유저 id 항상 1,2,3)
import { sql } from 'drizzle-orm'
import { db } from '../src/db'
import { friend, user } from '../src/db/schema'

await db.delete(friend)
await db.delete(user)
await db.execute(sql`ALTER TABLE friend AUTO_INCREMENT = 1`)
await db.execute(sql`ALTER TABLE user AUTO_INCREMENT = 1`)

// providerId는 실제 구글 sub 값이 아니라 로컬 테스트용 더미값
await db.insert(user).values([
  { email: 'jongeun@x.com', nickname: '종은', tag: '0001', totalExp: 120, providerId: 'dev-1' },
  { email: 'siwon@x.com', nickname: '시원', tag: '0001', totalExp: 340, providerId: 'dev-2' },
  { email: 'minjun@x.com', nickname: '민준', tag: '0001', totalExp: 50, providerId: 'dev-3' },
])

const rows = await db.select({ id: user.id, nickname: user.nickname, tag: user.tag }).from(user)
console.log('seeded:', rows)
process.exit(0)
