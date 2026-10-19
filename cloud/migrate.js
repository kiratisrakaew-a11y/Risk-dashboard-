'use strict';
/**
 * คัดลอกข้อมูลจาก Google Sheet "Risk Register — DB" (Apps Script) → Firestore
 *
 *   node migrate.js --sheet <DB_ID> [--replace] [--dry-run]
 *
 * ต้อง login ก่อน (Cloud Shell):
 *   gcloud auth application-default login --scopes=https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/spreadsheets.readonly
 *
 * - อ่านทุกชีตตาม SHEETS ใน src/Schema.gs (ชื่อคอลัมน์ = แถวที่ 1)
 * - collection ที่มีข้อมูลอยู่แล้วจะไม่ถูกเขียนทับ เว้นแต่ใส่ --replace
 * - วันที่แปลงแบบเดียวกับ src/Db.gs (Period → yyyy-MM, *_At → yyyy-MM-ddTHH:mm:ss, อื่นๆ → yyyy-MM-dd)
 */
const path = require('node:path');
const vm = require('node:vm');
const fs = require('node:fs');
const { loadSheet } = require('./lib/sheets');
const { FirestoreStore } = require('./lib/stores');
const { formatDate } = require('./lib/runtime');

function arg(name) {
  const i = process.argv.indexOf('--' + name);
  return i < 0 ? null : process.argv[i + 1] && !/^--/.test(process.argv[i + 1]) ? process.argv[i + 1] : true;
}

function loadSchema() {
  const ctx = vm.createContext({ console });
  const SRC = path.join(__dirname, '..', 'src');
  fs.readdirSync(SRC).filter((f) => f.endsWith('.gs')).sort()
    .forEach((f) => vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f }));
  return JSON.parse(JSON.stringify(ctx.SHEETS));
}

/** แถวของชีต → objects (pure, มี test) */
function rowsToObjects(values) {
  if (!values || !values.length) return [];
  const head = values[0].map((h) => String(h).trim());
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (row.every((c) => c === '' || c === null || c === undefined)) continue;
    const o = { _seq: i };
    head.forEach((h, j) => {
      if (!h) return;
      let v = row[j] === undefined || row[j] === null ? '' : row[j];
      if (v && typeof v === 'object' && v.$date !== undefined) {
        const d = new Date(v.$date);
        v = h === 'Period' ? formatDate(d, '', 'yyyy-MM') : /_At$|^At$/.test(h) ? formatDate(d, '', "yyyy-MM-dd'T'HH:mm:ss") : formatDate(d, '', 'yyyy-MM-dd');
      }
      o[h] = v;
    });
    out.push(o);
  }
  return out;
}

async function main() {
  const sheetArg = arg('sheet');
  if (!sheetArg || sheetArg === true) throw new Error('ใส่ --sheet <ID หรือ URL ของไฟล์ Risk Register — DB>');
  const id = String(sheetArg).match(/[-\w]{25,}/)[0];
  const dry = !!arg('dry-run');
  const replace = !!arg('replace');
  const SHEETS = loadSchema();
  const store = dry ? null : new FirestoreStore({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
  const report = [];
  for (const name of Object.keys(SHEETS)) {
    const values = await loadSheet(id, name);
    if (values === null) { report.push([name, 'ไม่มีชีตนี้ — ข้าม']); continue; }
    const rows = rowsToObjects(values);
    if (dry) { report.push([name, rows.length + ' แถว (dry-run)']); continue; }
    const existing = await store.count(name);
    if (existing && !replace) { report.push([name, 'มีข้อมูลแล้ว ' + existing + ' รายการ — ข้าม (ใช้ --replace เพื่อเขียนทับ)']); continue; }
    if (existing) await store.clear(name);
    const ops = rows.map((r) => ({ name, id: store.newId(name), data: r }));
    await store.commit(ops, [name]);
    const after = await store.count(name);
    report.push([name, rows.length + ' แถว → Firestore ' + after + ' รายการ' + (after === rows.length ? ' ✓' : ' ✗ ไม่ตรง!')]);
  }
  console.log('\nผลการย้ายข้อมูล (' + id + ')');
  report.forEach(([n, m]) => console.log('  ' + n.padEnd(18) + m));
}

if (require.main === module) main().catch((e) => { console.error('ผิดพลาด:', e.message); process.exit(1); });

module.exports = { rowsToObjects };
