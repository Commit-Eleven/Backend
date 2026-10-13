export const shortProblems = (await Bun.file('static/problems/short.json').json()) as {
  id: string
  title: string
}[]
