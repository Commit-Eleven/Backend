export const parsonsProblems = (await Bun.file('static/problems/parsons.json').json()) as {
  id: string
  title: string
}[]
