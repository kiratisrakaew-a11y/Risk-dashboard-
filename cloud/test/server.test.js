'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');
const { signSession, verifySession, checkIdPayload, COOKIE } = require('../lib/auth');
const { gridToValues, serialToMs } = require('../lib/sheets');

test('session cookie: เซ็น/ตรวจได้, ปลอมแปลงหรือหมดอายุ → ไม่ผ่าน', () => {
  const t = signSession('a@planbmedia.co.th', 'secret', 1000);
  assert.equal(verifySession(t, 'secret', 2000), 'a@planbmedia.co.th');
  assert.equal(verifySession(t, 'other', 2000), null);
  assert.equal(verifySession(t, 'secret', 1000 + 13 * 3600e3), null);
  const [body, mac] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ e: 'admin@planbmedia.co.th', x: 9e15 })).toString('base64url') + '.' + mac;
  assert.equal(verifySession(forged, 'secret', 2000), null);
  assert.equal(verifySession(body, 'secret', 2000), null);
  assert.equal(verifySession('', 'secret'), null);
});

test('ID token: รับเฉพาะโดเมนบริษัท + อีเมลยืนยันแล้ว', () => {
  assert.equal(checkIdPayload({ email: 'A@planbmedia.co.th', hd: 'planbmedia.co.th', email_verified: true }, 'planbmedia.co.th'), 'a@planbmedia.co.th');
  assert.throws(() => checkIdPayload({ email: 'a@gmail.com', email_verified: true }, 'planbmedia.co.th'), /เฉพาะบัญชี/);
  assert.throws(() => checkIdPayload({ email: 'a@planbmedia.co.th', hd: 'evil.com', email_verified: true }, 'planbmedia.co.th'), /เฉพาะบัญชี/);
  assert.throws(() => checkIdPayload({ email: 'a@planbmedia.co.th', hd: 'planbmedia.co.th', email_verified: false }, 'planbmedia.co.th'), /ยืนยัน/);
});

test('อ่าน Google Sheet: ตัดแถว/คอลัมน์ว่างท้าย, วันที่ → { $date }', () => {
  const v = gridToValues([
    { values: [{ effectiveValue: { stringValue: 'A' } }, { effectiveValue: { numberValue: 46022 }, effectiveFormat: { numberFormat: { type: 'DATE' } } }, {}] },
    { values: [{ effectiveValue: { numberValue: 3 } }] },
    { values: [{}] }
  ]);
  assert.equal(v.length, 2);
  assert.equal(v[1].length, 2);
  assert.equal(v[1][1], '');
  assert.equal(new Date(v[0][1].$date + 7 * 3600e3).toISOString().slice(0, 10), '2025-12-31');
  assert.equal(serialToMs(25569), -7 * 3600e3);
});

function start(opts = {}) {
  const calls = [];
  const runtime = {
    has: (fn) => ['apiInit', 'apiListRisks', 'dailyJob'].indexOf(fn) >= 0,
    run: async (fn, args, who) => { calls.push({ fn, args, who }); if (fn === 'apiInit') return { value: JSON.stringify({ user: { name: 'A' } }), files: [] }; return { value: 'ok', files: [] }; }
  };
  const auth = {
    verifyIdToken: async (t) => { if (t !== 'good') throw new Error('bad token'); return 'a@planbmedia.co.th'; },
    verifyCronToken: async (t) => { if (t !== 'cron') throw new Error('bad'); return 'sa@x'; }
  };
  const pages = { login: () => 'LOGIN', app: (n) => 'APP ' + n, error: (m) => 'ERR ' + m };
  const app = createApp({ runtime, auth, pages, secret: 's', devUser: '', cronEmail: 'sa@x', ...opts });
  return new Promise((resolve) => {
    const srv = app.listen(0, () => resolve({ srv, calls, url: 'http://127.0.0.1:' + srv.address().port }));
  });
}
const J = { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' };

test('server: login → cookie → เรียก api ได้; ไม่มี session / ชื่อไม่ใช่ api* / ไม่มี header → ปฏิเสธ', async () => {
  const { srv, calls, url } = await start();
  try {
    assert.equal(await (await fetch(url + '/')).text(), 'LOGIN');
    let r = await fetch(url + '/api/apiListRisks', { method: 'POST', headers: J, body: '{"args":[]}' });
    assert.equal(r.status, 401);
    r = await fetch(url + '/auth/login', { method: 'POST', headers: J, body: JSON.stringify({ credential: 'bad' }) });
    assert.equal(r.status, 401);
    r = await fetch(url + '/auth/login', { method: 'POST', headers: J, body: JSON.stringify({ credential: 'good' }) });
    const cookie = r.headers.get('set-cookie');
    assert.match(cookie, new RegExp('^' + COOKIE + '=.*HttpOnly'));
    const C = { ...J, Cookie: cookie.split(';')[0] };
    assert.equal(await (await fetch(url + '/', { headers: { Cookie: C.Cookie } })).text(), 'APP A');
    r = await fetch(url + '/api/apiListRisks', { method: 'POST', headers: C, body: '{"args":["OPS","2026"]}' });
    assert.deepEqual(await r.json(), { ok: true, value: 'ok' });
    assert.equal(calls.at(-1).who.email, 'a@planbmedia.co.th');
    assert.deepEqual(calls.at(-1).args, ['OPS', '2026']);
    r = await fetch(url + '/api/dailyJob', { method: 'POST', headers: C, body: '{}' });
    assert.equal(r.status, 404);
    r = await fetch(url + '/api/requireAdmin_', { method: 'POST', headers: C, body: '{}' });
    assert.equal(r.status, 404);
    r = await fetch(url + '/api/apiListRisks', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: C.Cookie }, body: '{}' });
    assert.equal(r.status, 400);
  } finally { srv.close(); }
});

test('server: cron ต้องมี token ของ Cloud Scheduler', async () => {
  const { srv, calls, url } = await start();
  try {
    let r = await fetch(url + '/cron/daily', { method: 'POST' });
    assert.equal(r.status, 403);
    r = await fetch(url + '/cron/daily', { method: 'POST', headers: { Authorization: 'Bearer cron' } });
    assert.equal(r.status, 200);
    assert.equal(calls.at(-1).fn, 'dailyJob');
    r = await fetch(url + '/cron/other', { method: 'POST', headers: { Authorization: 'Bearer cron' } });
    assert.equal(r.status, 404);
  } finally { srv.close(); }
});
