// 가입 때 랜덤 이름 + 4자리 태그로 닉네임 자동 생성.

const ADJECTIVES = [
    "명랑한", "고귀한", "용감한", "조용한", "느긋한", "재빠른", "수줍은", "당당한",
    "엉뚱한", "다정한", "씩씩한", "총명한", "부지런한", "장난스러운", "호기심많은", "차분한",
    "유쾌한", "단단한", "포근한", "날렵한", "진지한", "능청스러운", "산뜻한", "든든한",
    "반짝이는", "졸린", "배고픈", "신난", "의젓한", "귀여운", "늠름한", "똑똑한",
]

const NOUNS = [
    "황소", "영웅", "여우", "고래", "부엉이", "판다", "수달", "펭귄",
    "호랑이", "다람쥐", "두루미", "코끼리", "고슴도치", "돌고래", "너구리", "물범",
    "기린", "사자", "토끼", "거북이", "올빼미", "참새", "해달", "치타",
    "늑대", "곰", "매", "오리", "낙타", "사슴", "하마", "앵무새",
]

const pick = <T>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)]!

// 자동 생성은 띄어쓰기 없이. 예: 호기심많은기린
export const randomNickname = () => `${pick(ADJECTIVES)}${pick(NOUNS)}`

// 사용자가 직접 바꾸는 닉네임. 띄어쓰기 허용, 앞뒤 공백은 자르고 연속 공백은 하나로. 2~20자
export const NICKNAME_MIN = 2
export const NICKNAME_MAX = 20
export function normalizeNickname(v: unknown): string | null {
    if (typeof v !== "string") return null
    const s = v.trim().replace(/\s+/g, " ")
    return s.length >= NICKNAME_MIN && s.length <= NICKNAME_MAX ? s : null
}

// 0000 ~ 9999
export const randomTag = () => String(Math.floor(Math.random() * 10000)).padStart(4, "0")
