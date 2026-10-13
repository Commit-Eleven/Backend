export const spaghettiProblems = (await Bun.file('static/problems/spaghetti.json').json()) as {
  id: string
  title: string
}[]
