import { type FriendStatus, SEARCH_RESULT_LIMIT } from '../constants'
import { Errors } from '../lib/errors'
import { type FriendRow, friendRepository } from '../repositories/friendRepository'
import { type UserSummary, userRepository } from '../repositories/userRepository'

// 정확한 리포지토리 타입 대신 서비스가 실제로 필요로 하는 최소 모양만 요구한다.
// 그래야 테스트에서 진짜 DB 로우와 무관한 fake를 그대로 넣을 수 있다.
type FriendRepo = {
  findById(id: number): Promise<FriendRow | undefined>
  findBetween(a: number, b: number): Promise<FriendRow | undefined>
  listByUser(userId: number): Promise<FriendRow[]>
  create(requesterId: number, addresseeId: number): Promise<FriendRow>
  updateStatus(id: number, status: FriendStatus, respondedAt: Date): Promise<void>
  remove(id: number): Promise<void>
}
type UserRepo = {
  findById(id: number): Promise<{ id: number } | undefined>
  findByIds(ids: number[]): Promise<UserSummary[]>
  search(query: string, excludeId: number, limit?: number): Promise<UserSummary[]>
}

export function createFriendService(friendRepo: FriendRepo, userRepo: UserRepo) {
  async function searchUsers(query: string, excludeId: number) {
    const q = query.trim()
    if (!q) throw Errors.invalidInput('q 파라미터 필요')
    return userRepo.search(q, excludeId, SEARCH_RESULT_LIMIT)
  }

  async function listFriends(userId: number) {
    const rows = await friendRepo.listByUser(userId)
    const otherIds = rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId))
    const others = await userRepo.findByIds(otherIds)
    const otherById = new Map(others.map((u) => [u.id, u]))

    return rows.map((r) => {
      const otherId = r.requesterId === userId ? r.addresseeId : r.requesterId
      return {
        friendshipId: r.id,
        status: r.status,
        direction: r.requesterId === userId ? ('outgoing' as const) : ('incoming' as const),
        // 정상적으론 항상 있어야 함(FK로 보장). 방어적으로만 처리.
        user: otherById.get(otherId) ?? {
          id: otherId,
          nickname: '(알 수 없음)',
          tag: '0000',
          totalExp: 0,
        },
      }
    })
  }

  async function sendRequest(requesterId: number, addresseeId: number) {
    if (!addresseeId) throw Errors.invalidInput('targetUserId 필요')
    if (addresseeId === requesterId) throw Errors.invalidInput('자기 자신 X')

    const target = await userRepo.findById(addresseeId)
    if (!target) throw Errors.notFound('없는 사용자')

    const existing = await friendRepo.findBetween(requesterId, addresseeId)
    if (existing) throw Errors.duplicate('이미 신청했거나 친구')

    const created = await friendRepo.create(requesterId, addresseeId)
    return { friendshipId: created.id, status: created.status }
  }

  async function acceptRequest(userId: number, friendshipId: number) {
    const f = await friendRepo.findById(friendshipId)
    if (!f) throw Errors.notFound('없는 요청')
    if (f.addresseeId !== userId) throw Errors.forbidden('내가 받은 요청 아님')
    if (f.status !== 'pending') throw Errors.invalidInput('이미 처리됨')

    await friendRepo.updateStatus(friendshipId, 'accepted', new Date())
    return { friendshipId, status: 'accepted' as const }
  }

  async function removeFriendship(userId: number, friendshipId: number) {
    const f = await friendRepo.findById(friendshipId)
    if (!f) throw Errors.notFound('없는 관계')
    if (f.requesterId !== userId && f.addresseeId !== userId) {
      throw Errors.forbidden('내 관계 아님')
    }

    await friendRepo.remove(friendshipId)
    const message = f.status === 'accepted' ? '친구 삭제됨' : '친구 요청 거절됨'
    return { friendshipId, message }
  }

  return { searchUsers, listFriends, sendRequest, acceptRequest, removeFriendship }
}

export const friendService = createFriendService(friendRepository, userRepository)
