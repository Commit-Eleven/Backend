import { Hono } from 'hono'
import { PROBLEM_TAG } from '../util/config/constants'
import { type AuthEnv, requireAuth } from '../util/http/auth'
import { ok } from '../util/http/response'

export const tags = new Hono<AuthEnv>()

// 문제를 거르는 데 쓰는 태그 목록. DB가 아니라 고정 상수라 조회만 한다
tags.get('', requireAuth, (c) => {
  return ok(c, { tags: PROBLEM_TAG })
})
