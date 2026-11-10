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

// 프로필을 볼 수 있는 범위
export const PROFILE_VISIBILITY = ['public', 'friends', 'private'] as const

export const DEFAULT_STUDY_LANGUAGE = 'python'
export const DEFAULT_GROUP_CAPACITY = 10
export const GROUP_CAPACITY_MIN = 2
export const GROUP_CAPACITY_MAX = 50
export const SEARCH_RESULT_LIMIT = 20

// 제출 이력 페이지 크기
export const SUBMISSION_PAGE_LIMIT = 20
export const SUBMISSION_PAGE_LIMIT_MAX = 50

// 내 경험치에서 보여줄 최근 획득 기록 수
export const EXP_HISTORY_LIMIT = 20

// 랭킹 페이지 크기
export const RANKING_PAGE_SIZE = 20
export const RANKING_PAGE_SIZE_MAX = 50

// 메인페이지에 보여줄 추천 문제 수
export const HOME_RECOMMEND_LIMIT = 3

// 요청 본문 한도
export const MAX_BODY_BYTES = 100 * 1024
export const MAX_JSON_DEPTH = 8
