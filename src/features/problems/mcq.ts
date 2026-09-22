import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { getMcqProblems, getProblem, type McqProblem } from '../../problems'

const McqProblemSchema = z
  .object({
    id: z.number().int().openapi({ example: 1 }),
    title: z.string().openapi({ example: '1 + 1은 무엇일까요?' }),
    choices: z.array(z.string()).openapi({ example: ['1', '2', '3', '4', '5'] }),
  })
  .openapi('McqProblem')

const AnswerRequestSchema = z
  .object({
    id: z.number().int(),
    choice: z.number().int(),
  })
  .openapi('AnswerRequest')

const AnswerResponseSchema = z
  .object({
    result: z.boolean(),
  })
  .openapi('AnswerResponse')

const ErrorResponseSchema = z
  .object({
    message: z.string(),
  })
  .openapi('ErrorResponse')

const getMcqRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: McqProblemSchema,
        },
      },
      description: '문제 풀에서 무작위 객관식 문제를 반환한다',
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: '문제 풀이 비어 있음',
    },
  },
})

const answerMcqRoute = createRoute({
  method: 'post',
  path: '/answer',
  request: {
    body: {
      content: {
        'application/json': {
          schema: AnswerRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: AnswerResponseSchema,
        },
      },
      description: '정답 여부를 반환한다',
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: '존재하지 않는 문제 id',
    },
  },
})

const mcq = new OpenAPIHono()

mcq.openapi(getMcqRoute, (c) => {
  const pool = getMcqProblems()
  if (pool.length === 0) {
    return c.json({ message: '문제 풀이 비어 있습니다' }, 404)
  }

  const problem = pool[Math.floor(Math.random() * pool.length)]
  return c.json({ id: problem.id, title: problem.title, choices: problem.choices }, 200)
})

mcq.openapi(answerMcqRoute, (c) => {
  const body = c.req.valid('json')
  const problem = getProblem(body.id) as McqProblem | undefined

  if (!problem) {
    return c.json({ message: `존재하지 않는 문제입니다: ${body.id}` }, 404)
  }

  return c.json({ result: body.choice === problem.answer }, 200)
})

export default mcq
