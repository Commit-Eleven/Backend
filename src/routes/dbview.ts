import { getTableColumns } from 'drizzle-orm'
import { Hono } from 'hono'
import { db, schema } from '../db'
import { fail, ok } from '../lib/response'

export const dbview = new Hono()

const TABLES = {
  user: schema.user,
  submission: schema.submission,
  exp_log: schema.expLog,
  friend: schema.friend,
  study_group: schema.studyGroup,
  group_member: schema.groupMember,
  notification: schema.notification,
  notification_setting: schema.notificationSetting,
} as const

type TableName = keyof typeof TABLES

dbview.get('/db/tables/:name', async (c) => {
  const name = c.req.param('name') as TableName
  const table = TABLES[name]
  if (!table) return fail(c, 'NOT_FOUND', '없는 테이블', 404)

  const columns = Object.keys(getTableColumns(table))
  const rows = await db.select().from(table as any).limit(200)

  return ok(c, { table: name, columns, rows })
})

const HTML = /* html */ `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>DB 뷰어</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 1000px; margin: 24px auto; padding: 0 16px; }
  h1 { font-size: 18px; }
  .tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; }
  .tabs button { padding: 6px 10px; font-size: 13px; cursor: pointer; border: 1px solid #ccc; border-radius: 6px; background: #f6f6f6; }
  .tabs button.active { background: #333; color: #fff; border-color: #333; }
  .status { font-size: 13px; color: #666; margin: 6px 0; }
  .table-wrap { overflow-x: auto; border: 1px solid #ddd; border-radius: 8px; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; white-space: nowrap; }
  th, td { border-bottom: 1px solid #eee; padding: 6px 10px; text-align: left; }
  th { background: #fafafa; position: sticky; top: 0; }
  tr:hover td { background: #f9f9f9; }
  button.reload { margin-left: auto; }
</style>
</head>
<body>
<h1>DB 뷰어</h1>
<div class="tabs" id="tabs"></div>
<div class="status" id="status">테이블을 선택하세요.</div>
<div class="table-wrap"><table id="grid"><thead id="thead"></thead><tbody id="tbody"></tbody></table></div>

<script>
  const TABLES = ${JSON.stringify(Object.keys(TABLES))}
  const tabsEl = document.getElementById('tabs')
  const statusEl = document.getElementById('status')
  const thead = document.getElementById('thead')
  const tbody = document.getElementById('tbody')

  TABLES.forEach((name) => {
    const btn = document.createElement('button')
    btn.textContent = name
    btn.onclick = () => load(name, btn)
    tabsEl.appendChild(btn)
  })

  function esc(v) {
    if (v === null || v === undefined) return ''
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
  }

  async function load(name, btn) {
    ;[...tabsEl.children].forEach((b) => b.classList.remove('active'))
    btn.classList.add('active')
    statusEl.textContent = '불러오는 중...'
    thead.innerHTML = ''
    tbody.innerHTML = ''
    try {
      const res = await fetch('/db/tables/' + name)
      const json = await res.json()
      if (!json.success) {
        statusEl.textContent = '오류: ' + json.error.message
        return
      }
      const { columns, rows } = json.data
      thead.innerHTML = '<tr>' + columns.map((c) => '<th>' + c + '</th>').join('') + '</tr>'
      tbody.innerHTML = rows
        .map((r) => '<tr>' + columns.map((c) => '<td>' + esc(r[c]) + '</td>').join('') + '</tr>')
        .join('')
      statusEl.textContent = name + ' — ' + rows.length + '개 행 (최대 200개)'
    } catch (e) {
      statusEl.textContent = '요청 실패: ' + e
    }
  }

  if (tabsEl.firstChild) load(TABLES[0], tabsEl.firstChild)
</script>
</body>
</html>`

dbview.get('/db', (c) => c.html(HTML))
