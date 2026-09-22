import { Hono } from "hono"
import blank from "./features/blank"
import auth from "./features/auth"

const app = new Hono()

app.route("/api/blank", blank)
app.route("/auth", auth)

export default app
