import { Hono } from "hono"
import blank from "./features/blank"

const app = new Hono()

app.route("/api/blank", blank)

export default app
