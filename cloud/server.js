'use strict';
/**
 * Risk Register & KRI บน Cloud Run
 *   GET  /               หน้าเว็บ (ยังไม่ login → หน้าเข้าสู่ระบบ Google)
 *   POST /auth/login     รับ ID token จาก Google → ออก session cookie
 *   POST /auth/logout
 *   POST /api/:fn        เรียกฟังก์ชัน api* ใน src/WebApp.gs (แทน google.script.run)
 *   GET  /download/:t    ไฟล์ Excel จากการ Export
 *   POST /cron/:job      งานตั้งเวลา (Cloud Scheduler): daily, ai-batch
 */
const path = require('node:path');
const express = require('express');
const { createRuntime } = require('./lib/runtime');
const { createPages } = require('./lib/page');
const { COOKIE, SESSION_HOURS, signSession, verifySession, createAuth, readCookie } = require('./lib/auth');
const { buildRegisterXlsx } = require('./lib/xlsx');

const CRON_JOBS = { daily: 'dailyJob', 'ai-batch': 'runAiBatch' };

function createApp({ runtime, auth, pages, secret, devUser, cronEmail, secureCookie }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(express.json({ limit: '2mb' }));
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    next();
  });

  const downloads = new Map(); // token -> { buf, name, email, exp }

  const baseUrl = (req) => req.protocol + '://' + req.get('host') + '/';
  function sessionEmail(req) {
    // รันในเครื่องเท่านั้น: DEV_USER=* ให้สลับผู้ใช้ด้วย ?user=… (เก็บใน cookie dev_user)
    if (devUser === '*') return readCookie(req, 'dev_user') || null;
    if (devUser) return devUser;
    return verifySession(readCookie(req, COOKIE), secret);
  }
  function setCookie(res, value, maxAgeSec) {
    res.set('Set-Cookie', COOKIE + '=' + encodeURIComponent(value) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + maxAgeSec + (secureCookie ? '; Secure' : ''));
  }

  async function runFn(fn, args, email, req) {
    const out = await runtime.run(fn, args, { email, baseUrl: baseUrl(req) });
    for (const f of out.files) {
      if (f.type === 'register') {
        downloads.set(f.token, { buf: await buildRegisterXlsx(f), name: f.name + '.xlsx', email, exp: Date.now() + 15 * 60e3 });
      }
    }
    for (const [t, d] of downloads) if (d.exp < Date.now()) downloads.delete(t);
    return out.value;
  }

  app.get('/healthz', (req, res) => res.type('text').send('ok'));

  app.get('/', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (devUser === '*' && req.query.user) {
      res.set('Set-Cookie', 'dev_user=' + encodeURIComponent(String(req.query.user).toLowerCase()) + '; Path=/; SameSite=Lax');
      req.headers.cookie = 'dev_user=' + encodeURIComponent(String(req.query.user).toLowerCase());
    }
    const email = sessionEmail(req);
    if (!email) return res.type('html').send(pages.login());
    try {
      const v = await runFn('apiInit', [], email, req);
      const init = typeof v === 'string' ? JSON.parse(v) : v;
      res.type('html').send(pages.app(init.user && init.user.name || email, init));
    } catch (e) {
      res.status(403).type('html').send(pages.error(e.message));
    }
  });

  app.post('/auth/login', async (req, res) => {
    try {
      if (req.get('X-Requested-With') !== 'fetch') throw new Error('คำขอไม่ถูกต้อง');
      const email = await auth.verifyIdToken(String(req.body && req.body.credential || ''));
      setCookie(res, signSession(email, secret), SESSION_HOURS * 3600);
      res.json({ ok: true });
    } catch (e) {
      res.status(401).json({ ok: false, error: e.message });
    }
  });

  app.post('/auth/logout', (req, res) => {
    setCookie(res, '', 0);
    if (req.get('X-Requested-With') === 'fetch') return res.json({ ok: true });
    res.redirect(303, './');
  });

  app.post('/api/:fn', async (req, res) => {
    const fn = req.params.fn;
    if (req.get('X-Requested-With') !== 'fetch') return res.status(400).json({ ok: false, error: 'คำขอไม่ถูกต้อง' });
    const email = sessionEmail(req);
    if (!email) return res.status(401).json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' });
    if (!/^api[A-Z]\w*$/.test(fn) || !runtime.has(fn)) return res.status(404).json({ ok: false, error: 'ไม่พบคำสั่ง ' + fn });
    const args = Array.isArray(req.body && req.body.args) ? req.body.args : [];
    try {
      const value = await runFn(fn, args, email, req);
      res.json({ ok: true, value: value === undefined ? null : value });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.get('/download/:token', (req, res) => {
    const email = sessionEmail(req);
    const d = downloads.get(req.params.token);
    if (!email || !d || d.email !== email || d.exp < Date.now()) return res.status(404).type('text').send('ไฟล์หมดอายุหรือไม่มีสิทธิ์ — กด Export ใหม่อีกครั้ง');
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', "attachment; filename=\"risk-register.xlsx\"; filename*=UTF-8''" + encodeURIComponent(d.name));
    res.send(d.buf);
  });

  app.post('/cron/:job', async (req, res) => {
    const fn = CRON_JOBS[req.params.job];
    if (!fn) return res.status(404).send('unknown job');
    try {
      const token = String(req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      await auth.verifyCronToken(token, baseUrl(req) + 'cron/' + req.params.job, cronEmail);
    } catch (e) {
      return res.status(403).send('forbidden');
    }
    try {
      const v = await runtime.run(fn, [], { email: '', baseUrl: baseUrl(req) });
      res.json({ ok: true, value: v.value === undefined ? null : v.value });
    } catch (e) {
      console.error('cron', fn, e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  return app;
}

async function main() {
  const env = process.env;
  const onCloudRun = !!env.K_SERVICE;
  if (env.DEV_USER && onCloudRun) throw new Error('DEV_USER ใช้ได้เฉพาะรันในเครื่อง');
  let store;
  if (env.MEMORY_DB) {
    const { MemoryStore } = require('./lib/stores');
    store = new MemoryStore(env.MEMORY_SEED ? require(path.resolve(env.MEMORY_SEED)) : require('./test/fixture-seed'));
  } else {
    const { FirestoreStore } = require('./lib/stores');
    store = new FirestoreStore({ projectId: env.GOOGLE_CLOUD_PROJECT });
  }
  const props = {};
  ['GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY'].forEach((k) => { if (env[k]) props[k] = env[k].trim(); });
  const project = env.GOOGLE_CLOUD_PROJECT || '';
  const runtime = createRuntime({
    store, props,
    fetchImpl: require('./lib/http').fetchImpl,
    sheetLoader: require('./lib/sheets').loadSheet,
    mailer: async (m) => console.log('[mail ปิดอยู่]', m.to, '|', m.subject),
    consoleUrl: project ? 'https://console.cloud.google.com/firestore/databases/-default-/data?project=' + project : '',
    extraFiles: [path.join(__dirname, 'gs', 'CloudOverrides.js')].concat(env.DEV_EXTRA_GS && !onCloudRun ? [path.resolve(env.DEV_EXTRA_GS)] : [])
  });
  const app = createApp({
    runtime,
    auth: createAuth({ clientId: env.OAUTH_CLIENT_ID, allowedDomain: env.ALLOWED_DOMAIN }),
    pages: createPages({ clientId: env.OAUTH_CLIENT_ID, allowedDomain: env.ALLOWED_DOMAIN }),
    secret: env.SESSION_SECRET || await store.getSecret(),
    devUser: env.DEV_USER ? env.DEV_USER.toLowerCase() : '',
    cronEmail: env.CRON_SA_EMAIL || '',
    secureCookie: onCloudRun
  });
  const port = Number(env.PORT) || 8080;
  app.listen(port, () => console.log('Risk Register listening on :' + port + (env.DEV_USER ? ' (DEV_USER=' + env.DEV_USER + ')' : '')));
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });

module.exports = { createApp, CRON_JOBS };
