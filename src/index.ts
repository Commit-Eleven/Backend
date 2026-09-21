import { Hono } from "hono"
import { initializeTable } from "./schema"
import mcq from "./features/problems/mcq"

initializeTable()

const app = new Hono()

app.route("/api/problems/mcq", mcq)

export default app
