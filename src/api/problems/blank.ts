export const blankProblems = (await Bun.file('static/problems/blank.json').json()) as {
  id: string
  title: string
}[]
