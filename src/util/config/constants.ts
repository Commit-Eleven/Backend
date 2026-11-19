export const USER_TIER = ['normal', 'creator', 'admin'] as const

export const FRIEND_STATUS = ['pending', 'accepted'] as const

export const GROUP_ROLE = ['owner', 'manager', 'member'] as const

export const EXP_REASON = ['solve', 'bonus', 'event'] as const

export const NOTIFICATION_TYPE = [
  'friend_request',
  'friend_accepted',
  'group_invite',
  'group_joined',
  'document_submitted',
  'document_reviewed',
  'document_comment',
  'system',
] as const

export const STUDY_LANGUAGE = ['html', 'javascript', 'java', 'python'] as const
export const STUDY_LEVEL = ['beginner', 'intermediate', 'advanced'] as const

// 프로필을 볼 수 있는 범위
// 프로필 사진 주소 최대 길이
export const AVATAR_URL_MAX_LENGTH = 512

// 프로필 사진 업로드 한도. 파일 한 개 기준이고 multipart 경계 등 부가 바이트는 따로 둔다
export const AVATAR_UPLOAD_MAX_BYTES = 2 * 1024 * 1024
export const AVATAR_MULTIPART_OVERHEAD_BYTES = 64 * 1024
// 압축 폭탄(작은 파일이 디코딩될 때 커지는 이미지)을 막기 위한 가로·세로 한도
export const AVATAR_MAX_DIMENSION = 4096

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

// 문서
export const DOCUMENT_KIND = ['note', 'wiki', 'report'] as const
export const REPORT_STATUS = ['draft', 'pending', 'approved', 'rejected'] as const
export const REVIEW_DECISION = ['approved', 'rejected'] as const
export const DOCUMENT_TITLE_MAX = 100
export const DOCUMENT_BODY_MAX = 25000
export const DOCUMENT_COMMENT_MAX = 1000
export const REVIEW_COMMENT_MAX = 500
export const DOCUMENT_EXCERPT_LENGTH = 120
export const DOCUMENT_PAGE_SIZE = 20
export const DOCUMENT_PAGE_SIZE_MAX = 50
// 문서마다 남겨 두는 이전 버전 수
export const REVISION_KEEP = 30
export const BOOKMARK_MAX = 200
// 한 사람이 만들 수 있는 문서 수
export const DOCUMENT_LIMIT_PER_USER = 500
