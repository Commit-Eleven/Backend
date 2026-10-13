import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'

type McqProblem = {
  id: string
  type: 'multiple_choice'
  title: string
  content: {
    choices: string[]
    answer_index: number
  }
}

export const mcqProblems = (await Bun.file('static/problems/mcq.json').json()) as McqProblem[]
const problems = new Map(mcqProblems.map((problem) => [problem.id, problem]))

const problemSchema = z
  .object({
    id: z.string().min(1).openapi({ example: 'mc-001' }),
    title: z.string().openapi({ example: '리스트 컴프리헨션' }),
    choices: z.array(z.string()).openapi({
      example: ['[x for x in range(10)]', '{x for x in range(10)}', '(x for x in range(10))'],
    }),
  })
  .openapi('McqProblem')

const answerSchema = z
  .object({
    id: z.string().min(1),
    choice: z.number().int(),
  })
  .openapi('AnswerRequest')

const resultSchema = z
  .object({
    result: z.boolean(),
  })
  .openapi('AnswerResponse')

const errorSchema = z
  .object({
    message: z.string(),
  })
  .openapi('ErrorResponse')

const getRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: problemSchema,
        },
      },
      description: '문제 풀에서 무작위 객관식 문제를 반환한다',
    },
    404: {
      content: {
        'application/json': {
          schema: errorSchema,
        },
      },
      description: '문제 풀이 비어 있음',
    },
  },
})

const answerRoute = createRoute({
  method: 'post',
  path: '/answer',
  request: {
    body: {
      content: {
        'application/json': {
          schema: answerSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: resultSchema,
        },
      },
      description: '정답 여부를 반환한다',
    },
    404: {
      content: {
        'application/json': {
          schema: errorSchema,
        },
      },
      description: '존재하지 않는 문제 id',
    },
  },
})

const mcq = new OpenAPIHono()

mcq.openapi(getRoute, (c) => {
  if (mcqProblems.length === 0) {
    return c.json({ message: '문제 풀이 비어 있습니다' }, 404)
  }

  const problem = mcqProblems[Math.floor(Math.random() * mcqProblems.length)]
  return c.json({ id: problem.id, title: problem.title, choices: problem.content.choices }, 200)
})

mcq.openapi(answerRoute, (c) => {
  const body = c.req.valid('json')
  const problem = problems.get(body.id)

  if (!problem) {
    return c.json({ message: `존재하지 않는 문제입니다: ${body.id}` }, 404)
  }

  return c.json({ result: body.choice === problem.content.answer_index }, 200)
})

export default mcq
