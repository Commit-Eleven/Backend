export const USER_TIER = ['normal', 'creator', 'admin'] as const
export type UserTier = (typeof USER_TIER)[number]

export const FRIEND_STATUS = ['pending', 'accepted'] as const
export type FriendStatus = (typeof FRIEND_STATUS)[number]

export const GROUP_ROLE = ['owner', 'member'] as const
export type GroupRole = (typeof GROUP_ROLE)[number]

export const EXP_REASON = ['solve', 'bonus', 'event'] as const
export type ExpReason = (typeof EXP_REASON)[number]

export const NOTIFICATION_TYPE = [
  'friend_request',
  'friend_accepted',
  'group_invite',
  'group_joined',
  'system',
] as const
export type NotificationType = (typeof NOTIFICATION_TYPE)[number]

export const NICKNAME_TAG_LENGTH = 4
export const NICKNAME_TAG_MAX_RETRIES = 20
export const NICKNAME_MAX_LENGTH = 30
export const DEFAULT_NICKNAME = '유저'

export const DEFAULT_STUDY_LANGUAGE = 'python'
export const DEFAULT_GROUP_CAPACITY = 10
export const SEARCH_RESULT_LIMIT = 20

export const JWT_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7 // 7일

// 문제는 DB가 아니라 파일로 관리
export const PROBLEM_TYPE = [
  'fill_blank',
  'parsons',
  'multiple_choice',
  'short_answer',
  'spaghetti',
] as const
export type ProblemType = (typeof PROBLEM_TYPE)[number]

export const PROBLEM_FILE_PATHS: Record<ProblemType, string> = {
  fill_blank: 'problems/fill_blank.json',
  parsons: 'problems/parsons.json',
  multiple_choice: 'problems/multiple_choice.json',
  short_answer: 'problems/short_answer.json',
  spaghetti: 'problems/spaghetti.json',
}

export const CURRICULUM_FILE_PATH = '커리큘럼/curriculum.json'
