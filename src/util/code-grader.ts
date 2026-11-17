// 코드 문제 채점 도우미. 사용자 코드는 서버에서 절대 실행하지 않는다.
// 1) 문법 검사로 틀린 코드를 걸러내고
// 2) 주석은 지우고, 문자열 안의 글자는 비운 코드에 정규식을 대 본다
//    그래서 print("if") 처럼 문자열 안에만 키워드가 있으면 통과하지 못한다

export type CodeCheck = {
  pattern: string
  flags?: string
  message: string
  // code: 주석을 지우고 문자열 안을 비운 코드에서 찾는다 (기본값)
  // source: 주석만 지운 코드에서 찾는다. 출력할 문자열("Hello")을 확인할 때 쓴다
  in?: 'code' | 'source'
}

type Views = { code: string; source: string }
type Prepared = { ok: true; views: Views } | { ok: false; error: string }

const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length
const blank = (text: string) => text.replace(/[^\n]/g, '') // 줄 번호가 안 밀리게 줄바꿈만 남긴다

// ---------- JavaScript / Java / Python ----------

type ScriptLanguage = 'javascript' | 'java' | 'python'

const QUOTES: Record<ScriptLanguage, string[]> = {
  javascript: ['`', '"', "'"],
  java: ['"""', '"', "'"],
  python: ['"""', "'''", '"', "'"],
}

// 주석을 지우고, 문자열은 source 에는 그대로, code 에는 따옴표만 남기고 비운다
function scan(src: string, language: ScriptLanguage): Prepared {
  const lineComment = language === 'python' ? '#' : '//'
  let code = ''
  let source = ''
  let i = 0

  while (i < src.length) {
    if (src.startsWith(lineComment, i)) {
      const end = src.indexOf('\n', i)
      i = end === -1 ? src.length : end
      continue
    }

    if (language !== 'python' && src.startsWith('/*', i)) {
      const end = src.indexOf('*/', i + 2)
      if (end === -1)
        return { ok: false, error: `${lineOf(src, i)}번째 줄: 주석 /* 이 닫히지 않았어요` }
      const kept = blank(src.slice(i, end + 2))
      code += kept
      source += kept
      i = end + 2
      continue
    }

    const quote = QUOTES[language].find((q) => src.startsWith(q, i))
    if (quote) {
      const multiline = quote.length === 3 || quote === '`'
      let j = i + quote.length
      let closed = false
      while (j < src.length) {
        if (src[j] === '\\') {
          j += 2
          continue
        }
        if (src.startsWith(quote, j)) {
          closed = true
          break
        }
        if (src[j] === '\n' && !multiline) break
        j++
      }
      if (!closed) {
        return { ok: false, error: `${lineOf(src, i)}번째 줄: 문자열 ${quote} 이 닫히지 않았어요` }
      }
      const inner = src.slice(i + quote.length, j)
      code += quote + blank(inner) + quote
      source += quote + inner + quote
      i = j + quote.length
      continue
    }

    code += src[i]
    source += src[i]
    i++
  }

  return { ok: true, views: { code, source } }
}

const CLOSE_TO_OPEN: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

// 괄호 짝 검사. 문자열 안을 비운 코드로 해야 "(" 같은 글자에 속지 않는다
function checkBrackets(code: string): string | null {
  const stack: { ch: string; line: number }[] = []
  let line = 1
  for (const ch of code) {
    if (ch === '\n') line++
    else if (ch === '(' || ch === '[' || ch === '{') stack.push({ ch, line })
    else if (ch in CLOSE_TO_OPEN) {
      const top = stack.pop()
      if (!top || top.ch !== CLOSE_TO_OPEN[ch])
        return `${line}번째 줄: 괄호 ${ch} 의 짝이 맞지 않아요`
    }
  }
  const left = stack.pop()
  return left ? `${left.line}번째 줄: 괄호 ${left.ch} 이 닫히지 않았어요` : null
}

const PYTHON_BLOCK = /^(if|elif|else|for|while|def|class|try|except|finally|with)\b/
const indentOf = (line: string) => line.length - line.trimStart().length

// 파이썬은 블록 줄 끝의 콜론(:)과 그 다음 줄 들여쓰기를 본다
function checkPythonBlocks(code: string): string | null {
  const lines = code.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].trim()
    if (!PYTHON_BLOCK.test(text)) continue
    // if (a and\n b): 처럼 괄호가 다음 줄로 이어지면 건너뛴다
    const opens = (text.match(/[([{]/g) ?? []).length
    const closes = (text.match(/[)\]}]/g) ?? []).length
    if (opens !== closes) continue

    if (!text.includes(':')) return `${i + 1}번째 줄: 끝에 콜론(:)이 빠졌어요`
    if (!text.endsWith(':')) continue // if x: print(x) 처럼 한 줄로 쓴 경우

    const next = lines.slice(i + 1).findIndex((line) => line.trim() !== '')
    if (next === -1 || indentOf(lines[i + 1 + next]) <= indentOf(lines[i])) {
      return `${i + 2 + Math.max(next, 0)}번째 줄: 콜론(:) 다음 줄은 들여쓰기를 해야 해요`
    }
  }
  return null
}

function checkJavaScriptSyntax(src: string): string | null {
  try {
    // 코드를 실행하지 않고 문법만 읽어 본다
    new Bun.Transpiler({ loader: 'js' }).transformSync(src)
    return null
  } catch (error) {
    const reason = error instanceof Error && error.message ? error.message : '알 수 없는 오류'
    return `문법 오류: ${reason}`
  }
}

function prepareScript(src: string, language: ScriptLanguage): Prepared {
  if (language === 'javascript') {
    const syntaxError = checkJavaScriptSyntax(src)
    if (syntaxError) return { ok: false, error: syntaxError }
  }
  const scanned = scan(src, language)
  if (!scanned.ok) return scanned

  const error =
    checkBrackets(scanned.views.code) ??
    (language === 'python' ? checkPythonBlocks(scanned.views.code) : null)
  return error ? { ok: false, error } : scanned
}

// ---------- HTML ----------

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
])

// 주석은 지우고, 여는 태그와 닫는 태그가 순서대로 짝이 맞는지 본다
function prepareHtml(src: string): Prepared {
  const unclosedComment = src.replace(/<!--[\s\S]*?-->/g, '').indexOf('<!--')
  if (unclosedComment !== -1) return { ok: false, error: '주석 <!-- 이 --> 로 닫히지 않았어요' }

  const source = src
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2\s*>)/gi, (_, open, _n, body, close) => {
      return open + blank(body) + close
    })

  // <h1>제목</h1 처럼 > 가 빠진 태그
  const broken = /<\/?[a-zA-Z][^<>]*(?=<|$)/.exec(source)
  if (broken) {
    return {
      ok: false,
      error: `${lineOf(source, broken.index)}번째 줄: ${broken[0].trim()} 태그가 > 로 닫히지 않았어요`,
    }
  }

  const stack: { name: string; line: number }[] = []
  for (const match of source.matchAll(/<(\/?)([a-zA-Z][\w-]*)\b[^<>]*?(\/?)>/g)) {
    const [, closing, rawName, selfClosing] = match
    const name = rawName.toLowerCase()
    const line = lineOf(source, match.index ?? 0)
    if (VOID_TAGS.has(name)) continue
    if (!closing) {
      if (!selfClosing) stack.push({ name, line })
      continue
    }
    const top = stack.pop()
    if (!top) return { ok: false, error: `${line}번째 줄: <${name}> 없이 </${name}> 만 있어요` }
    if (top.name !== name) {
      return { ok: false, error: `${top.line}번째 줄: <${top.name}> 태그가 닫히지 않았어요` }
    }
  }
  const left = stack.pop()
  if (left)
    return { ok: false, error: `${left.line}번째 줄: <${left.name}> 태그가 닫히지 않았어요` }

  return { ok: true, views: { code: source, source } }
}

// ---------- 채점 ----------

export type CompiledCheck = CodeCheck & { regex: RegExp }

export const compileChecks = (checks: CodeCheck[]): CompiledCheck[] =>
  checks.map((check) => ({ ...check, regex: new RegExp(check.pattern, check.flags) }))

export type GradeResult = {
  isAnswer: boolean
  passed: number
  total: number
  failed: string[]
  syntaxError?: string
}

export function gradeCode(
  submitted: string,
  language: string | undefined,
  checks: CompiledCheck[],
): GradeResult {
  const total = checks.length
  const prepared: Prepared =
    language === 'html'
      ? prepareHtml(submitted)
      : language === 'javascript' || language === 'java' || language === 'python'
        ? prepareScript(submitted, language)
        : { ok: true, views: { code: submitted, source: submitted } }

  if (!prepared.ok) {
    return {
      isAnswer: false,
      passed: 0,
      total,
      failed: [prepared.error],
      syntaxError: prepared.error,
    }
  }

  const failed = checks
    .filter((check) => !check.regex.test(prepared.views[check.in ?? 'code']))
    .map((check) => check.message)
  return { isAnswer: failed.length === 0, passed: total - failed.length, total, failed }
}
