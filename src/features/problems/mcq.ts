import { Hono } from "hono"

const mcq = new Hono()

mcq.get("/", (c) => {
    return c.json({
        id: 20,
        title: "김시원의 키는 몇 센티미터일까요?",
        choices: ["160", "164", "169", "170", "171"]
    })
})

mcq.post("/answer", async (c) => {
    const body = await c.req.json()
    const id = body["id"]
    const choice = body["choice"]

    // db 출력
    const answer = 0;

    return c.json({result: choice == answer ? true : false})
})

export default mcq
