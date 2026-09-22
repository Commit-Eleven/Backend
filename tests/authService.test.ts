import { describe, expect, test } from 'bun:test'
import type { NewUser } from '../src/repositories/userRepository'
import { createAuthService } from '../src/services/authService'

type FakeUser = NewUser & { id: number; totalExp: number; tier: 'normal' }

// 실제 DB 없이 서비스 로직만 검증하기 위한 fake repo
function makeFakeRepo(opts: { takenTags?: string[]; existingUser?: FakeUser } = {}) {
  const taken = new Set(opts.takenTags ?? [])
  const created: FakeUser[] = []
  return {
    async findByProviderId(providerId: string) {
      return opts.existingUser?.providerId === providerId ? opts.existingUser : undefined
    },
    async existsByNicknameAndTag(_nickname: string, tag: string) {
      return taken.has(tag)
    },
    async create(data: NewUser): Promise<FakeUser> {
      const user: FakeUser = { id: created.length + 1, totalExp: 0, tier: 'normal', ...data }
      created.push(user)
      return user
    },
    created,
  }
}

describe('assignUniqueTag', () => {
  test('안 겹치면 첫 시도에서 바로 통과', async () => {
    const repo = makeFakeRepo()
    const service = createAuthService(repo)
    const tag = await service.assignUniqueTag('종은')
    expect(tag).toHaveLength(4)
  })

  test('전부 겹치면 재시도 한도 넘겨서 실패', async () => {
    // 4자리 태그를 전부 막아버리는 fake는 비현실적이니, 재시도 자체가 도는지만 확인
    let attempts = 0
    const repo = {
      async findByProviderId() {
        return undefined
      },
      async existsByNicknameAndTag() {
        attempts++
        return true // 항상 이미 있다고 응답, 재시도 소진돼야 함
      },
      async create(data: NewUser): Promise<FakeUser> {
        return { id: 1, totalExp: 0, tier: 'normal', ...data }
      },
    }
    const service = createAuthService(repo)
    await expect(service.assignUniqueTag('종은')).rejects.toThrow()
    expect(attempts).toBeGreaterThan(1)
  })
})

describe('findOrCreateGoogleUser', () => {
  test('이미 있는 providerId면 새로 안 만들고 그대로 반환', async () => {
    const existingUser: FakeUser = {
      id: 5,
      providerId: 'sub-1',
      nickname: '기존',
      tag: '1234',
      email: 'old@x.com',
      totalExp: 0,
      tier: 'normal',
    }
    const repo = makeFakeRepo({ existingUser })
    const service = createAuthService(repo)

    const { user, isNewUser } = await service.findOrCreateGoogleUser({
      sub: 'sub-1',
      email: 'a@x.com',
    })

    expect(isNewUser).toBe(false)
    expect(user.id).toBe(5)
  })

  test('없는 providerId면 닉네임+태그 배정해서 새로 만듦', async () => {
    const repo = makeFakeRepo()
    const service = createAuthService(repo)

    const { user, isNewUser } = await service.findOrCreateGoogleUser({
      sub: 'sub-2',
      email: 'b@x.com',
      name: '새유저',
    })

    expect(isNewUser).toBe(true)
    expect(user.nickname).toBe('새유저')
    expect(user.tag).toHaveLength(4)
    expect(user.providerId).toBe('sub-2')
  })

  test('구글 프로필에 이름이 없으면 기본 닉네임 사용', async () => {
    const repo = makeFakeRepo()
    const service = createAuthService(repo)

    const { user } = await service.findOrCreateGoogleUser({ sub: 'sub-3', email: 'c@x.com' })

    expect(user.nickname).toBe('유저')
  })
})
