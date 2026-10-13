# Codegram

프로젝트 루트에서 실행합니다.

```sh
bun install
docker compose up -d
bun run dev
```

기본 서버 주소는 http://localhost:3000 이며, API 문서는 `/swagger`에서 확인합니다.
구글 로그인과 DB 연결 설정은 `.env.example`을 참고해 `.env`에 지정합니다.

```text
src/
├── api/
│   ├── index.ts              # 서버 진입점, 라우트 등록
│   ├── health.ts             # DB 연결 상태
│   ├── social/
│   │   ├── login.ts          # 소셜 로그인, 토큰, 로그아웃
│   │   └── sign.ts           # 최초 가입, 닉네임·태그 생성
│   ├── users/
│   │   ├── me.ts             # 내 닉네임 변경
│   │   └── friends.ts        # 사용자 검색, 친구 신청·수락·삭제
│   └── problems/
│       ├── mcq.ts            # 객관식 데이터와 API
│       ├── blank.ts          # 빈칸 문제 데이터
│       ├── parsons.ts        # 코드 순서 배열 문제 데이터
│       ├── short.ts          # 단답형 문제 데이터
│       ├── spaghetti.ts      # 코드 정리 문제 데이터
│       ├── catalog.ts        # 문제 요약 인덱스
│       └── learning.ts       # 학습 통계, 단원 진행률
└── util/
    ├── config/
    │   ├── env.ts            # 환경 설정
    │   └── constants.ts      # 공통 상수
    ├── db/
    │   ├── connection.ts     # DB 연결
    │   ├── schema.ts         # DB 스키마
    │   └── users.ts          # 공통 사용자 조회·저장
    └── http/
        ├── auth.ts           # JWT 인증 미들웨어
        ├── case.ts           # 요청·응답 필드명 변환
        └── response.ts       # 공통 응답과 오류
```

관련 파일을 `api`와 `util` 각각의 역할별 폴더에 모으고, 개별 파일의 책임은 유지합니다.
각 API 파일은 해당 기능의 요청 처리와 SQL·로직을 담당하고, 공통 코드는 `util`에 둡니다. 문제 원본은 `static/problems`, 커리큘럼은 `static/curriculum`에 둡니다.
문제 유형의 코드 파일과 데이터 파일 이름은 `mcq`, `blank`, `parsons`, `short`, `spaghetti`로 맞춥니다.
예를 들어 `src/api/problems/mcq.ts`는 `static/problems/mcq.json`을 읽습니다.
객관식 조회·채점 API와 커리큘럼은 `static/problems/mcq.json`의 동일한 문제 목록을 사용합니다.
별도 파일에 있던 문제 3개도 옮겨 총 6개를 보존했습니다. 문제 ID는 `mc-001` 같은 문자열입니다.
이전 숫자 ID `1`, `2`, `3`은 각각 `mc-004`, `mc-005`, `mc-006`으로 변경했습니다.
채점 요청 예시는 `{"id":"mc-001","choice":0}`이며, 조회 응답은 `{ id, title, choices }`입니다.
정답 인덱스는 데이터 파일의 `content.answer_index`에만 보관하고 조회 응답에는 포함하지 않습니다.
현재 문제 HTTP API는 객관식만 제공하며, 나머지 네 유형은 학습 현황에서 사용합니다.
구글 최초 로그인 시 자동 가입하므로 별도 회원가입 엔드포인트는 없습니다.

API의 기본 경로는 `api/index.ts`에서 파일 위치에 맞춰 등록합니다.
각 기능 파일에는 `/nickname`, `/answer` 같은 상대 경로만 작성합니다.

| 기능 | 요청 |
|---|---|
| 서버 상태 | `GET /api/health` |
| 구글 로그인·자동 가입 | `GET /api/social/login/google` |
| 구글 콜백 | `GET /api/social/login/google/callback` |
| 토큰 갱신 | `POST /api/social/login/refresh` |
| 로그아웃 | `POST /api/social/login/logout` |
| 개발용 토큰 | `GET /api/social/login/dev-token` |
| 닉네임 변경 | `PATCH /api/users/me/nickname` |
| 사용자 검색 | `GET /api/users/friends/search?q=검색어` |
| 친구 목록·신청 | `GET /api/users/friends`, `POST /api/users/friends` |
| 친구 수락·삭제 | `POST /api/users/friends/:id/accept`, `DELETE /api/users/friends/:id` |
| 학습 통계 | `GET /api/problems/learning/stats` |
| 단원 진행률 | `GET /api/problems/learning/units/:unit_id` |
| 객관식 조회·채점 | `GET /api/problems/mcq`, `POST /api/problems/mcq/answer` |

기존 `/auth/*`, `/friends`, `/me/*`, `/units/*`, `/users/search`, `/health` 주소는 새 경로로 변경했습니다.
프론트엔드의 호출 주소와 구글 OAuth의 승인된 리디렉션 URI도 새 콜백 주소로 맞춰야 합니다.
API 문서 주소 `/swagger`, `/doc`와 프론트엔드 로그인 완료 주소 `/auth/callback`은 유지합니다.

```sh
bun run typecheck
bun run lint
bun run build
bun dist/index.js
```

빌드 결과는 `dist/index.js`에 생성됩니다. 실행 시 `static` 아래의 문제·커리큘럼 파일과
설치된 의존성이 필요합니다. 요청에 따라 테스트 코드와 테스트 실행 설정은 제거했습니다.
