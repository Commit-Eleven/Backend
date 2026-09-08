import { Hono } from 'hono'
import { pool } from './db'

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

export default app
