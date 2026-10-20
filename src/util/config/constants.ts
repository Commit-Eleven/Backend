export const USER_TIER = ['normal', 'creator', 'admin'] as const

export const FRIEND_STATUS = ['pending', 'accepted'] as const

export const GROUP_ROLE = ['owner', 'member'] as const

export const EXP_REASON = ['solve', 'bonus', 'event'] as const

export const NOTIFICATION_TYPE = [
  'friend_request',
  'friend_accepted',
  'group_invite',
  'group_joined',
  'system',
] as const

export const NICKNAME_TAG_LENGTH = 4

// 첫 로그인 온보딩에서 고르는 값
export const STUDY_LANGUAGE = ['html_css', 'javascript', 'java', 'python'] as const
export const STUDY_LEVEL = ['beginner', 'intermediate', 'advanced'] as const

export const DEFAULT_STUDY_LANGUAGE = 'python'
export const DEFAULT_GROUP_CAPACITY = 10
export const SEARCH_RESULT_LIMIT = 20
