import { Hono } from 'hono'

// 친구 API 수동 테스트 페이지. GET /test
export const testpage = new Hono()

const HTML = /* html */ `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>friends API 테스트</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 640px; margin: 24px auto; padding: 0 16px; }
  h1 { font-size: 18px; }
  fieldset { border: 1px solid #ddd; border-radius: 8px; margin: 12px 0; padding: 12px 14px; }
  legend { font-weight: 600; font-size: 13px; color: #555; }
  label { display: inline-block; font-size: 13px; margin: 4px 8px 4px 0; }
  input { width: 90px; padding: 4px 6px; font-size: 13px; }
  input#q { width: 140px; }
  button { padding: 5px 10px; font-size: 13px; margin: 4px 4px 0 0; cursor: pointer; }
  pre { background: #111; color: #0f0; padding: 12px; border-radius: 8px; font-size: 12px;
        white-space: pre-wrap; word-break: break-all; min-height: 40px; }
  .status { font-weight: 700; }
</style>
</head>
<body>
<h1>codegram API 테스트</h1>
<p style="font-size:13px"><a href="/db">=> DB 뷰어 열기</a></p>

<fieldset>
  <legend>서버 상태</legend>
  <button onclick="call('GET', '/health')">GET /health</button>
</fieldset>

<fieldset>
  <legend>현재 로그인 유저 (x-user-id 헤더)</legend>
  <label>내 유저 id <input id="me" type="number" value="1" /></label>
  <span style="font-size:12px;color:#888">시드: 1=종은 2=시원 3=민준</span>
</fieldset>

<fieldset>
  <legend>친구 검색 - 신청 - 목록</legend>
  <label>검색어 <input id="q" value="원" /></label>
  <button onclick="call('GET', '/users/search?q=' + enc(v('q')))">GET /users/search</button>
  <br />
  <label>대상 유저 id <input id="target" type="number" value="2" /></label>
  <button onclick="call('POST', '/friends', { targetUserId: Number(v('target')) })">POST /friends</button>
  <br />
  <button onclick="call('GET', '/friends')">GET /friends</button>
</fieldset>

<fieldset>
  <legend>수락 - 거절/삭제</legend>
  <label>friendship id <input id="fid" type="number" value="1" /></label>
  <button onclick="call('POST', '/friends/' + v('fid') + '/accept')">POST /friends/:id/accept</button>
  <button onclick="call('DELETE', '/friends/' + v('fid'))">DELETE /friends/:id</button>
</fieldset>

<div class="status" id="status"></div>
<pre id="out">여기에 응답이 나옵니다.</pre>

<script>
  const v = (id) => document.getElementById(id).value
  const enc = encodeURIComponent
  async function call(method, path, body) {
    const opt = { method, headers: { 'x-user-id': v('me') } }
    if (body !== undefined) {
      opt.headers['content-type'] = 'application/json'
      opt.body = JSON.stringify(body)
    }
    document.getElementById('status').textContent = method + ' ' + path + ' ...'
    try {
      const res = await fetch(path, opt)
      const text = await res.text()
      let pretty = text
      try { pretty = JSON.stringify(JSON.parse(text), null, 2) } catch {}
      document.getElementById('status').textContent = method + ' ' + path + '  →  ' + res.status
      document.getElementById('out').textContent = pretty || '(빈 응답)'
    } catch (e) {
      document.getElementById('status').textContent = '요청 실패'
      document.getElementById('out').textContent = String(e)
    }
  }
</script>
</body>
</html>`

testpage.get('/test', (c) => c.html(HTML))
