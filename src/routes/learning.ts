import { Hono } from 'hono'
import { type AuthEnv, requireAuth } from '../lib/auth'
import { ok } from '../lib/response'
import { learningService } from '../services/learningService'

export const learning = new Hono<AuthEnv>()

learning.get('/me/stats', requireAuth, async (c) => {
  const stats = await learningService.getStats(c.get('userId'))
  return ok(c, stats)
})

learning.get('/units/:unit_id', requireAuth, async (c) => {
  const detail = await learningService.getUnitDetail(c.get('userId'), c.req.param('unit_id'))
  return ok(c, detail)
})
