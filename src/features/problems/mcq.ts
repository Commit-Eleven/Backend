import { createRoute, z, OpenAPIHono } from "@hono/zod-openapi"

const McqProblemSchema = z
    .object({
        id: z.number().int().openapi({ example: 20 }),
        title: z.string().openapi({ example: "김시원의 키는 몇 센티미터일까요?" }),
        choices: z.array(z.string()).openapi({ example: ["160", "164", "169", "170", "171"] }),
    })
    .openapi("McqProblem")

const AnswerRequestSchema = z
    .object({
        id: z.number().int(),
        choice: z.number().int(),
    })
    .openapi("AnswerRequest")

const AnswerResponseSchema = z
    .object({
        result: z.boolean(),
    })
    .openapi("AnswerResponse")

const getMcqRoute = createRoute({
    method: "get",
    path: "/",
    responses: {
        200: {
            content: {
                "application/json": {
                    schema: McqProblemSchema,
                },
            },
            description: "랜덤 객관식 문제를 반환한다",
        },
    },
})

const answerMcqRoute = createRoute({
    method: "post",
    path: "/answer",
    request: {
        body: {
            content: {
                "application/json": {
                    schema: AnswerRequestSchema,
                },
            },
        },
    },
    responses: {
        200: {
            content: {
                "application/json": {
                    schema: AnswerResponseSchema,
                },
            },
            description: "정답 여부를 반환한다",
        },
    },
})

const mcq = new OpenAPIHono()

mcq.openapi(getMcqRoute, (c) => {
    return c.json({
        id: 20,
        title: "김시원의 키는 몇 센티미터일까요?",
        choices: ["160", "164", "169", "170", "171"],
    })
})

mcq.openapi(answerMcqRoute, async (c) => {
    const body = c.req.valid("json")
    const answer = 0

    return c.json({ result: body.choice == answer })
})

export default mcq