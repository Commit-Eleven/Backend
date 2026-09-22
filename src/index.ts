import { OpenAPIHono } from "@hono/zod-openapi"
import { swaggerUI } from "@hono/swagger-ui"
import { initializeTable } from "./schema"
import { loadProblems } from "./problems"
import mcq from "./features/problems/mcq"

initializeTable()
loadProblems()

const app = new OpenAPIHono()

app.route("/api/problems/mcq", mcq)

app.doc("/doc", {
    openapi: "3.0.0",
    info: {
        title: "Codegram API",
        version: "0.1.0",
    },
})

app.get("/swagger", swaggerUI({ url: "/doc" }))

export default app
