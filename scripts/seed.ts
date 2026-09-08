// 개발용 시드. bun run scripts/seed.ts  (유저 id 항상 1,2,3)
import { sql } from 'drizzle-orm'
import { db } from '../src/db'
import { friend, user } from '../src/db/schema'

await db.delete(friend)
await db.delete(user)
await db.execute(sql`ALTER TABLE friend AUTO_INCREMENT = 1`)
await db.execute(sql`ALTER TABLE user AUTO_INCREMENT = 1`)

await db.insert(user).values([
  { email: 'jongeun@x.com', nickname: '종은', totalExp: 120 },
  { email: 'siwon@x.com', nickname: '시원', totalExp: 340 },
  { email: 'minjun@x.com', nickname: '민준', totalExp: 50 },
])

const rows = await db.select({ id: user.id, nickname: user.nickname }).from(user)
console.log('seeded:', rows)
process.exit(0)
