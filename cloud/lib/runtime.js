'use strict';
/**
 * รันโค้ด .gs ชุดเดียวกับ Apps Script บน Node
 * - โหลด ../src/*.gs ทั้งหมดเข้า vm context เดียวกัน (เหมือน global scope ของ Apps Script)
 * - แทนบริการของ Google (Session, PropertiesService, CacheService, UrlFetchApp, SpreadsheetApp, MailApp, ...) ด้วย shim
 * - UrlFetchApp / SpreadsheetApp เป็น synchronous ใน Apps Script แต่ Node เป็น async:
 *   ใช้วิธี "record & replay" — ครั้งแรกที่โค้ดขอข้อมูลภายนอก shim จะจดคำขอไว้แล้วหยุด
 *   server ไปดึงข้อมูลแบบ async (ไม่บล็อกผู้ใช้อื่น) แล้วรันฟังก์ชันเดิมใหม่โดยตอบจากผลที่ได้มา
 *   การเขียนข้อมูลของรอบที่ถูกหยุดจะถูกทิ้งทั้งหมด จึงไม่มีการบันทึกซ้ำ
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { createDb } = require('./db');

const SRC = path.join(__dirname, '..', '..', 'src');
const MAX_ROUNDS = 25;

class NeedAsync extends Error {
  constructor(need) { super('NEED_ASYNC'); this.need = need; }
}

function keyOf(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

function formatDate(d, tz, fmt) {
  const s = new Date(new Date(d).getTime() + 7 * 3600e3).toISOString(); // Asia/Bangkok
  return String(fmt).replace("'T'", 'T').replace('yyyy', s.slice(0, 4)).replace('MM', s.slice(5, 7)).replace('dd', s.slice(8, 10))
    .replace('HH', s.slice(11, 13)).replace('mm', s.slice(14, 16)).replace('ss', s.slice(17, 19));
}

/**
 * opts:
 *   store        ที่เก็บข้อมูล (FirestoreStore / MemoryStore)
 *   props        Script Properties (API keys ฯลฯ)
 *   fetchImpl    async (req) => { code, body } | throws  — เรียก AI / HTTP ภายนอก
 *   sheetLoader  async (id, name) => rows | null           — อ่าน Google Sheet (นำเข้า Risk Register เดิม)
 *   mailer       async (mail) => void
 *   consoleUrl   ลิงก์ไปหน้าข้อมูล (แสดงในหน้า ตั้งค่า)
 *   extraFiles   ไฟล์ .js เพิ่มเติมที่โหลดเข้า context หลัง .gs (override เฉพาะ Cloud)
 */
function createRuntime(opts) {
  const props = { DB_ID: 'firestore', ...(opts.props || {}) };
  const globalCache = new Map(); // key -> { v, exp }
  let R = null; // state ของ request ที่กำลังรัน (โค้ด .gs รันแบบ synchronous จึงมีได้ทีละ 1)

  const ctx = vm.createContext({ console });
  const realm = vm.runInContext('({ parse: function (s) { return JSON.parse(s); }, ' +
    'rows: function (s) { return JSON.parse(s, function (k, v) { return v && typeof v === "object" && v.$date !== undefined ? new Date(v.$date) : v; }); } })', ctx);
  const realmCopy = (x) => realm.parse(JSON.stringify(x));

  const db = createDb({
    store: opts.store,
    headersOf: (n) => ctx.SHEETS && ctx.SHEETS[n],
    names: () => Object.keys(ctx.SHEETS || {}),
    getReq: () => R,
    realmCopy,
    consoleUrl: opts.consoleUrl || ''
  });

  function cacheGet(k) {
    if (R && R.cachePuts.has(k)) return R.cachePuts.get(k);
    const e = globalCache.get(k);
    if (!e) return null;
    if (e.exp < Date.now()) { globalCache.delete(k); return null; }
    return e.v;
  }
  const scriptCache = {
    get: cacheGet,
    getAll: (keys) => { const o = {}; keys.forEach((k) => { const v = cacheGet(k); if (v !== null) o[k] = v; }); return realmCopy(o); },
    put: (k, v, ttl) => { R.cachePuts.set(k, String(v)); R.cacheTtl.set(k, (ttl || 600) * 1000); },
    putAll: (o, ttl) => Object.keys(o).forEach((k) => scriptCache.put(k, o[k], ttl)),
    remove: (k) => { R.cachePuts.set(k, null); R.cacheTtl.set(k, 0); }
  };

  function need(n) {
    R.pending.set(n.key, n);
    throw new NeedAsync(n);
  }

  const shims = {
    Session: {
      getActiveUser: () => ({ getEmail: () => (R ? R.email : '') }),
      getEffectiveUser: () => ({ getEmail: () => (R ? R.email : '') })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (props[k] === undefined || props[k] === '' ? null : props[k]),
        getProperties: () => realmCopy(props),
        setProperty: () => { throw new Error('บน Cloud ตั้งค่า API key ผ่าน Secret Manager / ตัวแปรสภาพแวดล้อม'); }
      })
    },
    CacheService: { getScriptCache: () => scriptCache, getUserCache: () => scriptCache },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
    Utilities: {
      formatDate,
      sleep: () => {},
      computeDigest: () => { throw new Error('ไม่รองรับ'); }
    },
    UrlFetchApp: {
      fetch: (url, o) => {
        o = o || {};
        const req = { url: String(url), method: String(o.method || 'get').toUpperCase(), contentType: o.contentType || '',
          headers: JSON.parse(JSON.stringify(o.headers || {})), payload: o.payload === undefined ? '' : String(o.payload) };
        const key = 'fetch:' + keyOf(req);
        const res = R.resolved.get(key);
        if (!res) need({ key, kind: 'fetch', req });
        if (res.error) throw new Error(res.error);
        return { getResponseCode: () => res.code, getContentText: () => res.body };
      }
    },
    SpreadsheetApp: {
      flush: () => {},
      openById: (id) => ({
        getId: () => id,
        getSheetByName: (name) => {
          const key = 'sheet:' + id + ':' + name;
          if (!R.resolved.has(key)) need({ key, kind: 'sheet', id: String(id), name: String(name) });
          const res = R.resolved.get(key);
          if (res.error) throw new Error(res.error);
          if (!res.rows) return null;
          const values = realm.rows(JSON.stringify(res.rows));
          return { getName: () => name, getDataRange: () => ({ getValues: () => values }) };
        }
      }),
      create: () => { throw new Error('การสร้าง Google Sheet ไม่รองรับบน Cloud'); }
    },
    DriveApp: { getFileById: () => { throw new Error('ไม่รองรับบน Cloud'); } },
    MailApp: { sendEmail: (m) => { R.mails.push(JSON.parse(JSON.stringify(m))); } },
    ScriptApp: {
      getService: () => ({ getUrl: () => (R ? R.baseUrl : '') }),
      getProjectTriggers: () => [], newTrigger: () => { throw new Error('บน Cloud ใช้ Cloud Scheduler'); }, deleteTrigger: () => {}
    },
    HtmlService: { createHtmlOutput: () => { throw new Error('ไม่รองรับบน Cloud'); } },
    __cloud: {
      // ไฟล์สำหรับดาวน์โหลด (export) — สร้างจริงหลัง request สำเร็จ
      addFile: (f) => { const token = crypto.randomBytes(18).toString('base64url'); R.files.push({ token, ...JSON.parse(JSON.stringify(f)) }); return token; }
    }
  };
  Object.assign(ctx, shims);

  const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.gs')).sort();
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  for (const f of opts.extraFiles || []) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: path.basename(f) });

  ctx.Db = db.api;
  ctx.Db.writeSettings = (o) => db.writeSettings(o, () => ctx.resetConfigMemo_());

  async function resolve(n) {
    try {
      if (n.kind === 'fetch') return await opts.fetchImpl(n.req);
      if (n.kind === 'sheet') {
        if (!opts.sheetLoader) return { error: 'ไม่ได้ตั้งค่าการอ่าน Google Sheet' };
        return { rows: await opts.sheetLoader(n.id, n.name) };
      }
      return { error: 'ไม่รู้จักคำขอ ' + n.kind };
    } catch (e) {
      return { error: String(e && e.message || e) };
    }
  }

  /**
   * รันฟังก์ชัน .gs ตามชื่อ — คืน { value, files, mails }
   * ฟังก์ชันที่ throw → reject ด้วย Error(message)
   */
  async function run(fnName, args, who = {}) {
    if (typeof ctx[fnName] !== 'function') throw new Error('ไม่พบฟังก์ชัน ' + fnName);
    const resolved = new Map();
    for (let round = 0; round < MAX_ROUNDS; round++) {
      await db.ensureLoaded();
      const out = (() => {
        // ตั้งแต่ตรงนี้ถึงจบเป็น synchronous ทั้งหมด → ไม่มี request อื่นแทรกได้
        R = { email: String(who.email || '').toLowerCase(), baseUrl: who.baseUrl || '', resolved, pending: new Map(),
          cachePuts: new Map(), cacheTtl: new Map(), mails: [], files: [], db: db.newRequestState() };
        ctx.userMemo_ = null;
        ctx.configMemo_ = null;
        const state = R;
        let value, error;
        try {
          value = ctx[fnName].apply(null, realmCopy(args || []));
        } catch (e) {
          error = e;
        } finally {
          R = null;
        }
        if (state.pending.size) return { pending: [...state.pending.values()] };
        if (error) return { error };
        // สำเร็จ: นำการเขียนไปใช้ (sync) แล้วค่อยรอบันทึก
        state.cachePuts.forEach((v, k) => {
          if (v === null) globalCache.delete(k);
          else globalCache.set(k, { v, exp: Date.now() + state.cacheTtl.get(k) });
        });
        const saving = db.commit(state);
        return { value, saving, files: state.files, mails: state.mails };
      })();
      if (out.pending) {
        const res = await Promise.all(out.pending.map(resolve));
        out.pending.forEach((n, i) => resolved.set(n.key, res[i]));
        continue;
      }
      if (out.error) {
        const e = out.error;
        throw new Error(String(e && e.message !== undefined ? e.message : e).replace(/^NEED_ASYNC$/, 'ระบบไม่ตอบสนอง'));
      }
      await out.saving;
      if (out.mails.length && opts.mailer) await Promise.all(out.mails.map((m) => opts.mailer(m).catch((e) => console.warn('ส่งอีเมลไม่ได้:', e.message))));
      return { value: out.value, files: out.files, mails: out.mails };
    }
    throw new Error('คำขอนี้ต้องเรียกข้อมูลภายนอกหลายครั้งเกินไป');
  }

  return { run, ctx, db, has: (fn) => typeof ctx[fn] === 'function' };
}

module.exports = { createRuntime, NeedAsync, formatDate };
