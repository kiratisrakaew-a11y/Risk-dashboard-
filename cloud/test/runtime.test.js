'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRuntime } = require('../lib/runtime');
const { MemoryStore } = require('../lib/stores');
const SEED = require('./fixture-seed');

const OVERRIDES = path.join(__dirname, '..', 'gs', 'CloudOverrides.js');

function geminiResponse(obj) {
  return { code: 200, body: JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(obj) }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }) };
}

function make(extra = {}) {
  const store = new MemoryStore(JSON.parse(JSON.stringify(SEED)));
  const calls = [];
  const rt = createRuntime({
    store,
    props: { GEMINI_API_KEY: 'test-key' },
    fetchImpl: extra.fetchImpl || (async (req) => { calls.push(req); return geminiResponse({}); }),
    sheetLoader: extra.sheetLoader,
    extraFiles: [OVERRIDES].concat(extra.extraFiles || [])
  });
  return { store, rt, calls };
}

const val = (out) => (typeof out.value === 'string' ? JSON.parse(out.value) : out.value);

function goodRisk(over) {
  return Object.assign({
    Risk_Type: 'Operational risk', Risk_Subtype: 'IT system outage', Risk_Scenario: 'ระบบ CMS ล่มเกิน 4 ชั่วโมง ทำให้เปลี่ยนโฆษณาบนจอไม่ได้',
    Risk_Cause: 'เซิร์ฟเวอร์เดียว ไม่มีสำรอง', Consequences: 'ต้องชดเชยลูกค้า',
    Inherent_Impact: 3, Inherent_Impact_Rationale: 'กระทบลูกค้าหลายราย', Inherent_Likelihood: 3, Inherent_Likelihood_Rationale: 'เกิดปีละครั้ง',
    Existing_Control: 'Preventive: สำรองข้อมูลทุกวัน (IT, log)\nDetective: monitoring (NOC)\nCorrective: กู้ระบบตามคู่มือ (ticket)',
    Residual_Impact: 2, Residual_Impact_Rationale: 'กู้ได้เร็ว', Residual_Likelihood: 2, Residual_Likelihood_Rationale: 'มี monitoring',
    Risk_Owner: 'IT Manager'
  }, over || {});
}

test('รัน api เดิมจาก src/*.gs ได้ + สิทธิ์ตามแผนกยังทำงาน', async () => {
  const { rt } = make();
  const init = val(await rt.run('apiInit', [], { email: 'editor@co.th' }));
  assert.deepEqual(init.depts.map((d) => d.code), ['OPS']);
  await assert.rejects(rt.run('apiGetRisk', ['FIN-R-001'], { email: 'editor@co.th' }), /สิทธิ์/);
  await assert.rejects(rt.run('apiInit', [], { email: 'stranger@co.th' }), /ไม่มีสิทธิ์/);
});

test('บันทึก Risk ใหม่: ได้ Risk ID ตามกฎเดิม, บันทึกลง store, request ถัดไปเห็นข้อมูล', async () => {
  const { rt, store } = make();
  const out = val(await rt.run('apiSaveRisk', [{ dept: 'OPS', period: '2026', risk: goodRisk(), kris: [] }], { email: 'editor@co.th' }));
  assert.equal(out.riskId || out.Risk_ID || JSON.stringify(out).match(/OPS-R-\d+/)[0], 'OPS-R-004');
  const stored = (await store.load('Risks')).find((r) => r.Risk_ID === 'OPS-R-004');
  assert.ok(stored, 'ไม่ได้บันทึกลง store');
  assert.equal(stored.Assess_Mode, 'New Risk');
  const audit = await store.load('Audit_Log');
  assert.ok(audit.some((a) => a.Entity_ID === 'OPS-R-004' && a.Action === 'CREATE'));
  const list = val(await rt.run('apiListRisks', ['OPS', '2026'], { email: 'editor@co.th' }));
  assert.ok(list.some((r) => r.Risk_ID === 'OPS-R-004'));
});

test('validation ไม่ผ่าน → ไม่มีการเขียนอะไรเลย', async () => {
  const { rt, store } = make();
  const before = store.commits;
  await assert.rejects(rt.run('apiSaveRisk', [{ dept: 'OPS', period: '2026', risk: goodRisk({ Risk_Scenario: '' }), kris: [] }], { email: 'editor@co.th' }), /บันทึกไม่ได้/);
  assert.equal(store.commits, before);
  assert.equal((await store.load('Risks')).length, SEED.Risks.length);
});

test('ข้อมูลถูกแก้จากภายนอก (instance อื่น / migrate) → โหลดใหม่อัตโนมัติ', async () => {
  const { rt, store } = make();
  await rt.run('apiInit', [], { email: 'admin@co.th' });
  store.externalSet('Departments', 'newdept', { Dept_Code: 'NEW', Dept_Name: 'แผนกใหม่', Is_Active: 'TRUE', _seq: 99 });
  const init = val(await rt.run('apiInit', [], { email: 'admin@co.th' }));
  assert.ok(init.depts.some((d) => d.code === 'NEW'));
});

test('บันทึกลง store ไม่สำเร็จ → แจ้ง error และครั้งถัดไปโหลดข้อมูลจริงจาก store', async () => {
  const { rt, store } = make();
  store.failNext = true;
  await assert.rejects(rt.run('apiSaveRisk', [{ dept: 'OPS', period: '2026', risk: goodRisk(), kris: [] }], { email: 'editor@co.th' }), /simulated/);
  const list = val(await rt.run('apiListRisks', ['OPS', '2026'], { email: 'editor@co.th' }));
  assert.ok(!list.some((r) => r.Risk_ID === 'OPS-R-004'), 'ข้อมูลที่บันทึกไม่สำเร็จไม่ควรค้างในหน่วยความจำ');
});

test('AI (record & replay): เรียก Gemini จริง 1 ครั้ง, นับโควตา 1 ครั้ง, ผลผ่าน validateClassify_ เดิม', async () => {
  const calls = [];
  const { rt } = make({
    fetchImpl: async (req) => {
      calls.push(req);
      return geminiResponse({ candidates: [{ risk_type: 'Operational Risk', risk_subtype: 'IT system outage', confidence: 'high', reason: 'ระบบล่ม' }] });
    }
  });
  const draft = { Risk_Scenario: 'ระบบ CMS ล่มเกิน 4 ชั่วโมง ทำให้เปลี่ยนโฆษณาบนจอไม่ได้' };
  const out = val(await rt.run('apiAiSuggest', [{ dept: 'OPS', mode: 'classify', draft }], { email: 'editor@co.th' }));
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /generativelanguage\.googleapis\.com/);
  assert.equal(out.candidates[0].type, 'Operational risk'); // รวมตัวสะกดตาม Taxonomy
  const q = rt.ctx.CacheService.getScriptCache();
  // โควตาวันนี้ถูกนับ 1 ครั้ง (ไม่ถูกนับซ้ำจากการ replay)
  const today = rt.ctx.isoDate_(new Date());
  assert.equal(q.get('aiq:' + today + ':editor@co.th'), '1');
});

test('replay: งานที่เรียกภายนอกหลายครั้งและเขียนข้อมูลระหว่างทาง ไม่บันทึกซ้ำ และดึงข้อมูลพร้อมกัน', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-'));
  const f = path.join(dir, 'multi.js');
  fs.writeFileSync(f, `function multiFetch_() {
    var out = [];
    ['a', 'b', 'c'].forEach(function (x) {
      try { out.push(UrlFetchApp.fetch('https://example.test/' + x).getContentText()); } catch (e) { out.push('ERR'); }
      Db.append('AI_Runs', [{ Started_At: x }]);
    });
    return out.join(',');
  }`);
  let rounds = 0;
  const seen = [];
  const { rt, store } = make({
    extraFiles: [f],
    fetchImpl: async (req) => { seen.push(req.url); return { code: 200, body: req.url.slice(-1).toUpperCase() }; }
  });
  const before = (await store.load('AI_Runs')).length;
  const out = await rt.run('multiFetch_', [], { email: '' });
  rounds = seen.length;
  assert.equal(out.value, 'A,B,C');
  assert.equal(rounds, 3, 'แต่ละ URL ควรถูกเรียก 1 ครั้ง');
  assert.equal((await store.load('AI_Runs')).length - before, 3, 'ต้องเขียน 3 แถว ไม่ซ้ำ');
});

test('นำเข้า Risk Register เดิมจาก Google Sheet (ผ่าน sheetLoader) — วันที่เป็น Date เหมือน Apps Script', async () => {
  const header = Array.from({ length: 28 }, (_, i) => 'H' + i);
  const row = Array.from({ length: 28 }, () => '');
  Object.assign(row, { 0: 1, 1: 'Q4/2569', 2: 'Operations & Maintenance', 3: 'OPS-OLD-1', 4: 'Operational Risk', 5: 'IT system outage',
    6: 'ระบบล่ม', 21: { $date: Date.UTC(2026, 11, 30, 17) }, 23: 'จำนวนครั้งที่ล่ม' });
  const { rt, store } = make({ sheetLoader: async (id, name) => (name === 'RISK_REGISTER' ? [header, row] : null) });
  const out = val(await rt.run('apiImportLegacy', ['https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit', '2026'], { email: 'admin@co.th' }));
  assert.equal(out.risks, 1);
  const r = (await store.load('Risks')).find((x) => x.Risk_ID === 'OPS-OLD-1');
  assert.equal(r.Risk_Type, 'Operational risk');
  assert.equal(r.Mitigation_Due_Date, '2026-12-31');
  assert.equal(r.Business_Unit, 'OPS');
});

test('Export → ไฟล์สำหรับดาวน์โหลด (ข้อมูลจาก exportData_ ชุดเดียวกับ Apps Script)', async () => {
  const { rt } = make();
  const out = await rt.run('apiExport', ['OPS', '2026'], { email: 'editor@co.th' });
  const v = val(out);
  assert.match(v.url, /^download\//);
  assert.equal(out.files.length, 1);
  assert.equal(out.files[0].rows.length, v.rows);
  assert.equal(out.files[0].headers[3], 'Risk ID');
  await assert.rejects(rt.run('apiExport', ['', '2026'], { email: 'editor@co.th' }), /ADMIN|สิทธิ์/);
});
