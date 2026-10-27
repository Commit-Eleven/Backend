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

export const STUDY_LANGUAGE = ['html', 'javascript', 'java', 'python'] as const
export const STUDY_LEVEL = ['beginner', 'intermediate', 'advanced'] as const

export const DEFAULT_STUDY_LANGUAGE = 'python'
export const DEFAULT_GROUP_CAPACITY = 10
export const SEARCH_RESULT_LIMIT = 20

// 제출 이력 페이지 크기
export const SUBMISSION_PAGE_LIMIT = 20
export const SUBMISSION_PAGE_LIMIT_MAX = 50

// 문제 태그. 추가할 때 프론트 필터 목록도 같이 늘어난다
export const PROBLEM_TAG = ['html', 'js', 'java', 'css'] as const
