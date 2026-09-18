import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  char,
  check,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/mysql-core'
import {
  DEFAULT_GROUP_CAPACITY,
  DEFAULT_STUDY_LANGUAGE,
  EXP_REASON,
  FRIEND_STATUS,
  GROUP_ROLE,
  NICKNAME_TAG_LENGTH,
  NOTIFICATION_TYPE,
  USER_TIER,
} from '../constants'

const pk = () => bigint('id', { mode: 'number' }).autoincrement().primaryKey()
const createdAt = () => timestamp('created_at').defaultNow().notNull()
const updatedAt = () => timestamp('updated_at').defaultNow().onUpdateNow().notNull()

// user — 로그인은 구글 OAuth만. 비밀번호 없음.
// 닉네임은 디스코드식: nickname 자체는 중복 가능, (nickname, tag) 조합으로만 유일.
export const user = mysqlTable(
  'user',
  {
    id: pk(),
    email: varchar('email', { length: 255 }).notNull(),
    nickname: varchar('nickname', { length: 30 }).notNull(),
    tag: char('tag', { length: NICKNAME_TAG_LENGTH }).notNull(), // 랜덤 4자리, 예: "3231"
    tier: mysqlEnum('tier', USER_TIER).default('normal').notNull(),
    totalExp: int('total_exp').default(0).notNull(),
    providerId: varchar('provider_id', { length: 128 }).notNull(), // 구글 sub
    studyUnitId: varchar('study_unit_id', { length: 64 }),
    studyLanguage: varchar('study_language', { length: 20 })
      .default(DEFAULT_STUDY_LANGUAGE)
      .notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    uqEmail: unique('uq_user_email').on(t.email),
    uqNicknameTag: unique('uq_user_nickname_tag').on(t.nickname, t.tag),
    uqProviderId: unique('uq_user_provider_id').on(t.providerId),
    idxExp: index('idx_user_exp').on(t.totalExp),
  }),
)

// problemId는 문제 파일 id (fk 아님)
export const submission = mysqlTable(
  'submission',
  {
    id: pk(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    problemId: varchar('problem_id', { length: 64 }).notNull(),
    isCorrect: boolean('is_correct').notNull(),
    answer: json('answer'),
    runOutput: text('run_output'),
    createdAt: createdAt(),
  },
  (t) => ({
    idxUserProblem: index('idx_sub_user_problem').on(t.userId, t.problemId, t.createdAt),
    idxUserCorrect: index('idx_sub_user_correct').on(t.userId, t.isCorrect),
  }),
)

export const expLog = mysqlTable(
  'exp_log',
  {
    id: pk(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    problemId: varchar('problem_id', { length: 64 }),
    amount: int('amount').notNull(),
    reason: mysqlEnum('reason', EXP_REASON).default('solve').notNull(),
    createdAt: createdAt(),
  },
  (t) => ({
    uqSolve: unique('uq_explog_solve').on(t.userId, t.problemId, t.reason), // solve 1번
    idxUser: index('idx_explog_user').on(t.userId, t.createdAt),
  }),
)

export const friend = mysqlTable(
  'friend',
  {
    id: pk(),
    requesterId: bigint('requester_id', { mode: 'number' })
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    addresseeId: bigint('addressee_id', { mode: 'number' })
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: mysqlEnum('status', FRIEND_STATUS).default('pending').notNull(),
    createdAt: createdAt(),
    respondedAt: timestamp('responded_at'),
  },
  (t) => ({
    uqPair: unique('uq_friend_pair').on(t.requesterId, t.addresseeId),
    idxAddressee: index('idx_friend_addressee').on(t.addresseeId, t.status),
    chkSelf: check('chk_friend_self', sql`${t.requesterId} <> ${t.addresseeId}`),
  }),
)

export const studyGroup = mysqlTable(
  'study_group',
  {
    id: pk(),
    name: varchar('name', { length: 50 }).notNull(),
    description: varchar('description', { length: 255 }),
    ownerId: bigint('owner_id', { mode: 'number' })
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    capacity: smallint('capacity').default(DEFAULT_GROUP_CAPACITY).notNull(),
    createdAt: createdAt(),
  },
  (t) => ({
    idxOwner: index('idx_group_owner').on(t.ownerId),
  }),
)

export const groupMember = mysqlTable(
  'group_member',
  {
    groupId: bigint('group_id', { mode: 'number' })
      .notNull()
      .references(() => studyGroup.id, { onDelete: 'cascade' }),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: mysqlEnum('role', GROUP_ROLE).default('member').notNull(),
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ name: 'pk_group_member', columns: [t.groupId, t.userId] }),
    idxUser: index('idx_gm_user').on(t.userId),
  }),
)

export const notification = mysqlTable(
  'notification',
  {
    id: pk(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: mysqlEnum('type', NOTIFICATION_TYPE).notNull(),
    payload: json('payload'),
    isRead: boolean('is_read').default(false).notNull(),
    createdAt: createdAt(),
  },
  (t) => ({
    idxUser: index('idx_noti_user').on(t.userId, t.isRead, t.createdAt),
  }),
)

export const notificationSetting = mysqlTable(
  'notification_setting',
  {
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: mysqlEnum('type', NOTIFICATION_TYPE).notNull(),
    enabled: boolean('enabled').default(true).notNull(),
  },
  (t) => ({
    pk: primaryKey({ name: 'pk_noti_setting', columns: [t.userId, t.type] }),
  }),
)
