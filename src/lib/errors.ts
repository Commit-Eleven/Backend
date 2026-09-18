import type { ContentfulStatusCode } from 'hono/utils/http-status'

// 서비스 계층에서 던지는 에러. app.onError에서 잡아서 { code, message }로 응답한다.
// 라우터마다 try/catch를 반복하지 않기 위한 것 — 실패 케이스는 여기로 통일.
export class AppError extends Error {
  code: string
  status: ContentfulStatusCode

  constructor(code: string, message: string, status: ContentfulStatusCode = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

export const Errors = {
  unauthorized: (message = '인증 필요') => new AppError('UNAUTHORIZED', message, 401),
  forbidden: (message = '권한 없음') => new AppError('FORBIDDEN', message, 403),
  notFound: (message = '없는 리소스') => new AppError('NOT_FOUND', message, 404),
  invalidInput: (message: string) => new AppError('INVALID_INPUT', message, 400),
  duplicate: (message: string) => new AppError('DUPLICATE', message, 409),
  internal: (message = '서버 오류') => new AppError('INTERNAL', message, 500),
}
