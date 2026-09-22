import { Hono } from "hono"
import blank from "./features/blank"
import auth from "./features/auth"
import users from "./features/users"

const app = new Hono()

app.route("/api/blank", blank)
app.route("/auth", auth)
app.route("/me", users)

export default app
