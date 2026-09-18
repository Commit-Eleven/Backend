import { describe, expect, test } from 'bun:test'
import { createFriendService } from '../src/services/friendService'

type FakeFriendRow = {
  id: number
  requesterId: number
  addresseeId: number
  status: 'pending' | 'accepted'
  createdAt: Date
  respondedAt: Date | null
}

function makeFakeRepos() {
  let nextId = 1
  const rows: FakeFriendRow[] = []
  const users = new Map([
    [1, { id: 1, nickname: '종은', tag: '0001', totalExp: 120 }],
    [2, { id: 2, nickname: '시원', tag: '0001', totalExp: 340 }],
  ])

  const friendRepo = {
    async findById(id: number) {
      return rows.find((r) => r.id === id)
    },
    async findBetween(a: number, b: number) {
      return rows.find(
        (r) =>
          (r.requesterId === a && r.addresseeId === b) ||
          (r.requesterId === b && r.addresseeId === a),
      )
    },
    async listByUser(userId: number) {
      return rows.filter((r) => r.requesterId === userId || r.addresseeId === userId)
    },
    async create(requesterId: number, addresseeId: number) {
      const row = {
        id: nextId++,
        requesterId,
        addresseeId,
        status: 'pending' as const,
        createdAt: new Date(),
        respondedAt: null as Date | null,
      }
      rows.push(row)
      return row
    },
    async updateStatus(id: number, status: 'pending' | 'accepted', respondedAt: Date) {
      const row = rows.find((r) => r.id === id)
      if (!row) return
      row.status = status
      row.respondedAt = respondedAt
    },
    async remove(id: number) {
      const idx = rows.findIndex((r) => r.id === id)
      if (idx >= 0) rows.splice(idx, 1)
    },
  }

  const userRepo = {
    async findById(id: number) {
      return users.get(id)
    },
    async findByIds(ids: number[]) {
      return ids
        .map((id) => users.get(id))
        .filter((u): u is NonNullable<typeof u> => u !== undefined)
    },
    async search() {
      return []
    },
  }

  return { friendRepo, userRepo }
}

describe('sendRequest', () => {
  test('자기 자신에게 신청하면 에러', async () => {
    const { friendRepo, userRepo } = makeFakeRepos()
    const service = createFriendService(friendRepo, userRepo)
    await expect(service.sendRequest(1, 1)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  test('없는 유저에게 신청하면 에러', async () => {
    const { friendRepo, userRepo } = makeFakeRepos()
    const service = createFriendService(friendRepo, userRepo)
    await expect(service.sendRequest(1, 999)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  test('정상 신청 → pending', async () => {
    const { friendRepo, userRepo } = makeFakeRepos()
    const service = createFriendService(friendRepo, userRepo)
    const result = await service.sendRequest(1, 2)
    expect(result.status).toBe('pending')
  })

  test('같은 상대에게 중복 신청하면 에러', async () => {
    const { friendRepo, userRepo } = makeFakeRepos()
    const service = createFriendService(friendRepo, userRepo)
    await service.sendRequest(1, 2)
    await expect(service.sendRequest(1, 2)).rejects.toMatchObject({ code: 'DUPLICATE' })
  })

  test('역방향 신청도 중복으로 막힘', async () => {
    const { friendRepo, userRepo } = makeFakeRepos()
    const service = createFriendService(friendRepo, userRepo)
    await service.sendRequest(1, 2)
    await expect(service.sendRequest(2, 1)).rejects.toMatchObject({ code: 'DUPLICATE' })
  })
})

describe('acceptRequest', () => {
  test('수신자가 아니면 거부', async () => {
    const { friendRepo, userRepo } = makeFakeRepos()
    const service = createFriendService(friendRepo, userRepo)
    const { friendshipId } = await service.sendRequest(1, 2)
    await expect(service.acceptRequest(1, friendshipId)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  test('수신자가 수락하면 accepted', async () => {
    const { friendRepo, userRepo } = makeFakeRepos()
    const service = createFriendService(friendRepo, userRepo)
    const { friendshipId } = await service.sendRequest(1, 2)
    const result = await service.acceptRequest(2, friendshipId)
    expect(result.status).toBe('accepted')
  })
})

describe('removeFriendship', () => {
  test('당사자가 아니면 거부', async () => {
    const { friendRepo, userRepo } = makeFakeRepos()
    const service = createFriendService(friendRepo, userRepo)
    const { friendshipId } = await service.sendRequest(1, 2)
    await expect(service.removeFriendship(999, friendshipId)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  test('삭제 후 목록에서 사라짐', async () => {
    const { friendRepo, userRepo } = makeFakeRepos()
    const service = createFriendService(friendRepo, userRepo)
    const { friendshipId } = await service.sendRequest(1, 2)
    await service.removeFriendship(1, friendshipId)
    const list = await service.listFriends(1)
    expect(list).toHaveLength(0)
  })
})
