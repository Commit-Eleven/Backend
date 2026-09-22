import type { ContentfulStatusCode } from 'hono/utils/http-status'

// app.onError에서 처리하는 서비스 에러
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
