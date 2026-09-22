import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

export interface Problem {
    id: number
    type: string
    exp: number
}

export interface McqProblem extends Problem {
    type: "mcq"
    title: string
    choices: string[]
    answer: number
}

const PROBLEMS_DIR = path.join(import.meta.dir, "..", "problems")

const problems = new Map<number, Problem>()

function loadDir(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name)

        if (entry.isDirectory()) {
            loadDir(fullPath)
        } else if (entry.isFile() && entry.name.endsWith(".json")) {
            const problem = JSON.parse(readFileSync(fullPath, "utf-8")) as Problem
            problems.set(problem.id, problem)
        }
    }
}

export function loadProblems(): void {
    loadDir(PROBLEMS_DIR)
}

export function getProblem(id: number): Problem | undefined {
    return problems.get(id)
}

export function getMcqProblems(): McqProblem[] {
    return [...problems.values()].filter((problem): problem is McqProblem => problem.type === "mcq")
}