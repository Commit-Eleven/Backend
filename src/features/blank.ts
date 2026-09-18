import { Hono } from 'hono'

const blank = new Hono()

blank.get('/', (c) => {
  return c.text('Hello Blank!')
})

export default blank
