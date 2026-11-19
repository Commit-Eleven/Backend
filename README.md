# Codegram

프로젝트 루트에서 실행합니다.

```sh
bun install
docker compose up -d
bun run dev
```

기본 서버 주소는 `.env`의 `PORT`(예: `http://localhost:8899`)이며, API 문서 엔드포인트는
아직 제공하지 않습니다. 라우트 목록은 아래 표와 `src/api/index.ts`를 참고하세요.
구글 로그인과 DB 연결 설정은 `.env.example`을 참고해 `.env`에 지정합니다.
구글 로그인이 끝나면 백엔드는 `FRONTEND_URL/auth/callback?code=...`으로 일회용 코드를 전달하고,
프론트엔드가 `POST /api/social/login/exchange`로 토큰을 받아 갑니다. 로컬 개발은
`http://127.0.0.1:5173`, 운영은 프론트엔드 배포 주소(기본값 `https://codegram.me`)를 사용하세요.
Google OAuth의 승인된 리디렉션 URI에는 프론트 주소가 아니라
`https://codegram.me/api/social/login/google/callback` 같은 백엔드 콜백 주소를 등록해야 합니다.

```text
src/
├── api/
│   ├── index.ts              # 서버 진입점, 라우트 등록
│   ├── health.ts             # DB 연결 상태
│   ├── curriculum.ts         # 커리큘럼 조회
│   ├── units.ts              # 단원 상세·진행률
│   ├── lessons.ts            # 레슨 완료 저장
│   ├── ranking.ts            # 경험치 랭킹
│   ├── tags.ts               # 태그 목록
│   ├── groups.ts             # 그룹 생성·조회·참여·초대·삭제
│   ├── group-invites.ts      # 받은 그룹 초대 수락·거절
│   ├── notifications.ts      # 알림 생성·조회·설정
│   ├── social/
│   │   └── login.ts          # 구글 로그인, 토큰 교환·갱신, 로그아웃
│   ├── users/
│   │   ├── me.ts             # 내 정보·학습 설정·통계·제출·오답노트
│   │   ├── onboarding.ts     # 온보딩
│   │   ├── avatar.ts         # 프로필 사진 업로드·제공
│   │   ├── profile.ts        # 다른 사용자 프로필
│   │   └── friends.ts        # 사용자 검색, 친구 신청·수락·삭제
│   └── problems/
│       ├── mcq.ts            # 객관식
│       ├── blank.ts          # 빈칸
│       ├── parsons.ts        # 코드 순서 배열
│       ├── short.ts          # 단답형
│       └── code.ts           # 코드 작성
└── util/
    ├── config/
    │   ├── env.ts            # 환경 설정 (필수 값 검증 포함)
    │   └── constants.ts      # 공통 상수
    ├── db/
    │   ├── connection.ts     # DB 연결
    │   ├── schema.ts         # DB 스키마
    │   ├── migrate.ts        # 기동 시 마이그레이션
    │   ├── users.ts          # 공통 사용자 조회·저장
    │   ├── submissions.ts    # 제출 기록 저장·조회
    │   ├── notifications.ts  # 알림 생성(설정 반영)
    │   ├── invites.ts        # 그룹 초대
    │   └── errors.ts         # DB 오류 판별
    ├── curriculum.ts         # 커리큘럼 파일 로딩
    ├── learning.ts           # 단원 진행률 계산
    ├── problems.ts           # 문제 데이터 로딩
    ├── sign.ts               # 최초 가입, 닉네임·태그 생성
    └── http/
        ├── auth.ts           # JWT 인증 미들웨어
        ├── body.ts           # 요청 본문 검사
        ├── case.ts           # 요청·응답 필드명 변환
        └── response.ts       # 공통 응답과 오류
```

관련 파일을 `api`와 `util` 각각의 역할별 폴더에 모으고, 개별 파일의 책임은 유지합니다.
각 API 파일은 해당 기능의 요청 처리와 SQL·로직을 담당하고, 공통 코드는 `util`에 둡니다. 문제 원본은 `static/problems`, 커리큘럼은 `static/curriculum`에 둡니다.
문제 유형의 코드 파일과 데이터 파일 이름은 `mcq`, `blank`, `parsons`, `short`, `code`로 맞춥니다.
예를 들어 `src/api/problems/mcq.ts`는 `static/problems/mcq.json`을 읽습니다.
객관식 조회·채점 API와 커리큘럼은 `static/problems/mcq.json`의 동일한 문제 목록을 사용합니다.
문제 ID는 `mcq1`, `python-code-1` 같은 문자열입니다.
채점 요청 예시는 `{"id":"mcq1","answer":0}`이며, 조회 응답의 `content`에는 `choices`만 들어갑니다.
정답(`content.answer`)과 해설(`content.explanation`)은 데이터 파일에만 보관하고 조회 응답에는 포함하지 않습니다.
구글 최초 로그인 시 자동 가입하므로 별도 회원가입 엔드포인트는 없습니다.

API의 기본 경로는 `api/index.ts`에서 파일 위치에 맞춰 등록합니다.
각 기능 파일에는 `/nickname`, `/answer` 같은 상대 경로만 작성합니다.

| 기능 | 요청 |
|---|---|
| 서버 상태 | `GET /api/health` |
| 커리큘럼 조회 | `GET /api/curriculum` |
| 구글 로그인·자동 가입 | `GET /api/social/login/google` |
| 구글 콜백 | `GET /api/social/login/google/callback` |
| 로그인 코드 교환 | `POST /api/social/login/exchange` (body `{ code }`) |
| 토큰 갱신 | `POST /api/social/login/refresh` |
| 로그아웃 | `POST /api/social/login/logout` |
| 개발용 토큰 | `GET /api/social/login/dev-token` (`NODE_ENV=development` + `ENABLE_DEV_TOKEN=true` 일 때만) |
| 닉네임 변경 | `PATCH /api/users/me/nickname` |
| 프로필 사진 변경 | `PATCH /api/users/me/avatar` (multipart/form-data `image`, JSON `{ image_url }` 호환) |
| 프로필 사진 제공 | `GET /api/avatars/:file` |
| 내 그룹 목록 | `GET /api/me/groups` |
| 그룹 목록·참여·방장 위임 | `GET /api/groups`, `POST /api/groups/join`, `POST /api/groups/:id/owner` |
| 알림 생성·목록·설정 조회·변경 | `POST /api/notifications`, `GET /api/notifications`, `GET/PATCH /api/notifications/settings` |
| 제출 이력 조회 | `GET /api/users/me/submissions?limit=20&cursor=123` |
| 사용자 검색 | `GET /api/users/friends/search?q=검색어` |
| 친구 목록·신청 | `GET /api/users/friends`, `POST /api/users/friends` |
| 친구 수락·삭제 | `POST /api/users/friends/:id/accept`, `DELETE /api/users/friends/:id` |
| 그룹 랭킹 | `GET /api/groups/:id/ranking` |
| 그룹 삭제 | `DELETE /api/groups/:id` |
| 학습 통계 | `GET /api/users/me/stats` |
| 단원 진행률 | `GET /api/users/me/progress?language=html`, `GET /api/units/:unitId` |
| 문제 id로 조회 (유형 상관없음) | `GET /api/problems/:id` |
| 문제 조회·채점 | `GET /api/problems/{mcq,blank,parsons,short,code}?id=`, `POST /api/problems/{유형}` (body `{ id, answer }`) |
| 채점 응답 | 정답이면 `is_answer`, `awarded`, `awarded_exp`, 객관식·빈칸·순서·단답은 `explanation`까지 준다 |
| 코스를 언어로 거르기 | `GET /api/curriculum?language=html` |
| 레슨 완료 저장 | `POST /api/lessons/:lessonId/complete` (body `{ language }`) |
| 언어별 학습 진행 | `GET /api/users/me/progress?language=html` |
| 코드 작성 문제 조회·제출 | `GET /api/problems/code?id=`, `POST /api/problems/code` (body `{ id, code }`) |
| 알림 읽음 처리 | `PATCH /api/notifications/:id` (body `{ is_read }`) |
| 안 읽은 알림 개수 | `GET /api/notifications/unread-count` |
| 회원 탈퇴 | `DELETE /api/users/me` |
| 친구 요청 허용·프로필 공개 범위 | `GET·PATCH /api/users/me/privacy` |
| 오답노트 복습 완료 | `GET /api/users/me/wrong-notes/reviewed` |

기존 `/auth/*`, `/friends`, `/me/*`, `/units/*`, `/users/search`, `/health` 주소는 새 경로로 변경했습니다.
프론트엔드의 호출 주소와 구글 OAuth의 승인된 리디렉션 URI도 새 콜백 주소로 맞춰야 합니다.
API 문서(`/swagger`, `/doc`)는 제공하지 않으며, 프론트엔드 로그인 완료 주소는 `FRONTEND_URL/auth/callback`입니다.

## 프론트 요청 반영 메모

- 커리큘럼은 `static/curriculum/<language>.json`으로 언어별로 나뉘어 있고, `html-basic`, `javascript-basic`, `java-basic`, `python-basic` 코스가 있습니다. 다음 단원은 같은 언어 코스 안에서만 이어집니다.
- 문제 조회는 `?id=`를 주면 그 문제를, 안 주면 커리큘럼 단원 순서와 사용자 `studyLevel`에 맞는 문제를 하나 골라 돌려줍니다. 채점(`POST`)은 항상 문제 `id`가 필요합니다.
- 레슨 완료는 `lesson_progress`에 저장합니다. `lessonId`는 프론트가 정한 문자열(영문·숫자·`_`·`.`·`-`, 64자 이하)이며 서버의 단원·문제 id와는 따로 관리합니다. 문제가 있는 단원의 진행률은 제출 기록으로 계산하고, 문제가 없는 설명 레슨은 완료 API로 기록합니다.
- 코드 작성 문제는 서버에서 코드를 실행하지 않고 `static/problems/code.json`의 `checks`(정규식)에 맞는지만 검사합니다. 틀리면 부족한 조건을 `failed`로 돌려줍니다.
- 회원 탈퇴 시 제출 기록, 경험치, 친구, 알림, 레슨 기록은 함께 삭제됩니다. 다른 멤버가 남은 그룹의 방장이면 `409 OWNS_GROUPS`와 그룹 목록을 돌려주니 방장을 먼저 넘겨야 합니다. 나 혼자 남은 그룹은 계정과 함께 삭제됩니다.
- 프로필 공개 범위는 `public`(기본), `friends`, `private`입니다. 본인은 항상 볼 수 있고, 아니면 `403`입니다.
- 프로필 사진은 `PATCH /api/users/me/avatar`에 `multipart/form-data`의 `image` 필드로 보냅니다. PNG·JPEG·WebP만 받고(파일 내용의 시그니처로 판별, SVG 제외), 파일 2MB·가로세로 4096px까지입니다. 서버는 원본 파일 이름 대신 무작위 이름으로 `AVATAR_DIR`(기본 `data/avatars`)에 저장하고 `/api/avatars/<파일>` 주소를 DB에 기록합니다. 기존처럼 JSON `{ "image_url": null }`을 보내 기본 사진으로 되돌릴 수 있고, 외부 주소를 보내는 방식도 호환을 위해 남아 있습니다. 사진을 바꾸면 이전에 업로드한 파일은 지웁니다.

## 요청 본문 규칙

- 본문이 있는 API는 JSON 객체만 받습니다. `null`, 배열, 숫자, 문자열을 보내면 `400`입니다. 본문이 없으면 빈 객체로 봅니다.
- 본문은 100KB까지이고 넘으면 `413 PAYLOAD_TOO_LARGE`입니다. 프로필 사진 업로드만 예외로 2MB(+multipart 여유 64KB)까지 받습니다. 서버는 `Content-Length`를 믿지 않고 실제로 읽은 바이트로 한도를 검사합니다.
- 중첩은 8단계까지이고, 짝이 없는 서러게이트 같은 깨진 유니코드가 있으면 `400`입니다.

```sh
bun run typecheck
bun run lint
bun run build
bun dist/index.js
```

빌드 결과는 `dist/index.js`에 생성됩니다. 실행 시 `static` 아래의 문제·커리큘럼 파일과
설치된 의존성이 필요합니다. 요청에 따라 테스트 코드와 테스트 실행 설정은 제거했습니다.
