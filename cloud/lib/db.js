'use strict';
/**
 * Db ฉบับ Cloud — interface เดียวกับ src/Db.gs (readAll / append / update / withLock / audit / ...)
 * เพื่อให้ business logic ใน .gs ใช้ได้โดยไม่ต้องแก้
 *
 * - ข้อมูลทุก collection อยู่ในหน่วยความจำของ instance (base) โหลดจาก store ครั้งแรก
 *   และโหลดใหม่เฉพาะ collection ที่ version ใน store เปลี่ยน (มีคนอื่นแก้)
 * - ระหว่างรัน 1 request การเขียนทั้งหมดอยู่ใน buffer ของ request (R.db)
 *   สำเร็จ → นำไปใช้กับ base ทันที (synchronous) แล้วบันทึกลง store
 *   error / ต้องรอผลจาก AI → ทิ้ง buffer ทั้งหมด (ไม่มีการเขียนครึ่งๆ กลางๆ)
 */

const WRITE_ONLY = ['Audit_Log']; // เขียนอย่างเดียว ไม่โหลดเข้าหน่วยความจำ

function bkkStamp(d) {
  return new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 19);
}

function createDb({ store, headersOf, names, getReq, realmCopy, consoleUrl }) {
  const base = {}; // name -> { rows: [...], version }
  const inflight = new Set(); // การบันทึกที่ยังไม่เสร็จ — ต้องรอก่อนเทียบ version กับ store

  async function ensureLoaded() {
    while (inflight.size) await Promise.allSettled([...inflight]);
    const meta = await store.getMeta();
    const want = names().filter((n) => WRITE_ONLY.indexOf(n) < 0);
    await Promise.all(want.map(async (n) => {
      const v = meta.versions[n] || 0;
      if (base[n] && base[n].version === v) return;
      const rows = await store.load(n);
      rows.sort((a, b) => (Number(a._seq) || 0) - (Number(b._seq) || 0));
      base[n] = { rows, version: v };
    }));
  }

  function newRequestState() {
    return { work: {}, memo: {}, ops: [], touched: new Set() };
  }

  function st() {
    const R = getReq();
    if (!R) throw new Error('Db ใช้ได้เฉพาะระหว่างรัน request');
    return R.db;
  }

  function checkName(name) {
    if (!headersOf(name)) throw new Error('ไม่พบชีต ' + name + ' ใน DB');
  }

  function work(name) {
    const s = st();
    if (!s.work[name]) {
      if (WRITE_ONLY.indexOf(name) >= 0) s.work[name] = [];
      else {
        if (!base[name]) throw new Error('ยังไม่ได้โหลด ' + name);
        s.work[name] = JSON.parse(JSON.stringify(base[name].rows));
      }
    }
    return s.work[name];
  }

  function clean(name, obj) {
    const out = {};
    headersOf(name).forEach((h) => {
      const v = obj[h];
      out[h] = v === undefined || v === null ? '' : (v instanceof Date || Object.prototype.toString.call(v) === '[object Date]') ? bkkStamp(v) : v;
    });
    return JSON.parse(JSON.stringify(out));
  }

  function readAll(name) {
    checkName(name);
    const s = st();
    if (!s.memo[name]) s.memo[name] = realmCopy(work(name));
    return s.memo[name];
  }

  function append(name, objs) {
    checkName(name);
    if (!objs || !objs.length) return;
    const s = st();
    const rows = work(name);
    let seq = rows.reduce((m, r) => Math.max(m, Number(r._seq) || 0), 0);
    if (WRITE_ONLY.indexOf(name) >= 0) seq = Date.now() * 1000 + s.ops.length;
    Array.prototype.forEach.call(objs, (o) => {
      const id = store.newId(name);
      const data = { ...clean(name, o), _seq: ++seq };
      if (WRITE_ONLY.indexOf(name) < 0) rows.push({ ...data, _row: id });
      s.ops.push({ name, id, data });
    });
    s.touched.add(name);
    delete s.memo[name];
  }

  function update(name, rowId, obj) {
    checkName(name);
    const s = st();
    const rows = work(name);
    const i = rows.findIndex((r) => r._row === rowId);
    if (i < 0) throw new Error('ไม่พบแถว ' + rowId + ' ใน ' + name);
    const data = { ...clean(name, obj), _seq: rows[i]._seq };
    rows[i] = { ...data, _row: rowId };
    s.ops.push({ name, id: rowId, data });
    s.touched.add(name);
    delete s.memo[name];
  }

  function clearMemo() { st().memo = {}; }

  // ทุก request รันแบบ synchronous ใน thread เดียว จึง atomic อยู่แล้ว — แค่ล้าง memo ให้เหมือนของเดิม
  function withLock(fn) { clearMemo(); return fn(); }

  function now() { return bkkStamp(new Date()); }

  function audit(email, action, entity, id, before, after) {
    const j = (x) => (x === undefined || x === null ? '' : JSON.stringify(x).slice(0, 45000));
    append('Audit_Log', [{ At: now(), Email: email, Action: action, Entity: entity, Entity_ID: id, Before_JSON: j(before), After_JSON: j(after) }]);
  }

  function readSettings() {
    const out = {};
    readAll('Settings').forEach((r) => { if (r.Key !== '' && r.Key !== undefined) out[String(r.Key).trim()] = r.Value; });
    return out;
  }

  function writeSettings(obj, resetConfig) {
    let rows = readAll('Settings');
    Object.keys(obj).forEach((k) => {
      const hit = rows.filter((r) => r.Key === k)[0];
      if (hit) { hit.Value = obj[k]; update('Settings', hit._row, hit); } else append('Settings', [{ Key: k, Value: obj[k], Description: '' }]);
      rows = readAll('Settings');
    });
    if (resetConfig) resetConfig();
  }

  function unsupported() { throw new Error('คำสั่งนี้ใช้กับ Google Sheet เท่านั้น — ไม่รองรับบน Cloud'); }

  /** นำผลของ request ไปใช้กับ base (sync) แล้วคืน promise ที่บันทึกลง store */
  function commit(R) {
    const s = R.db;
    if (!s.ops.length) return Promise.resolve();
    const bumps = [...s.touched];
    bumps.forEach((n) => {
      if (WRITE_ONLY.indexOf(n) >= 0) return;
      base[n] = { rows: s.work[n], version: (base[n] ? base[n].version : 0) + 1 };
    });
    const p = store.commit(s.ops, bumps).catch((e) => {
      // บันทึกไม่สำเร็จ → บังคับโหลดใหม่จาก store ในครั้งถัดไป
      bumps.forEach((n) => { if (base[n]) base[n].version = -1; });
      throw e;
    });
    inflight.add(p);
    p.then(() => inflight.delete(p), () => inflight.delete(p));
    return p;
  }

  const api = {
    readAll, append, update, withLock, clearMemo, now, audit, readSettings, url: () => consoleUrl,
    sheet: unsupported, ss: unsupported
  };
  return { api, ensureLoaded, newRequestState, commit, writeSettings, _base: base };
}

module.exports = { createDb, WRITE_ONLY, bkkStamp };
