// ทดสอบ business rule ระดับ API (ส่ง/อนุมัติ, กรอก KRI, เงื่อนไข AI) ด้วย runtime เดียวกับเวอร์ชัน Cloud + DB ในหน่วยความจำ
// ไม่ต้องติดตั้ง package เพิ่ม (ใช้เฉพาะ cloud/lib/runtime.js, db.js, stores.js ซึ่งใช้แค่ Node built-in)
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRuntime } = require('../cloud/lib/runtime');
const { MemoryStore } = require('../cloud/lib/stores');
const SEED = require('../cloud/test/fixture-seed');

function make(seedPatch) {
  const seed = JSON.parse(JSON.stringify(SEED));
  if (seedPatch) seedPatch(seed);
  const store = new MemoryStore(seed);
  const calls = [];
  const rt = createRuntime({
    store, props: { GEMINI_API_KEY: 'k' },
    fetchImpl: async (req) => {
      calls.push(req);
      const data = { status: 'scored', questions: [], guidance: '', assumed_scenario: 'x', impact_by_dimension: { financial: 3, legal: 0, reputation: 2, operations: 2, esg: 0 },
        impact_reason: 'r', likelihood: 3, likelihood_reason: 'r', confidence: 'medium', missing_info: '' };
      return { code: 200, body: JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(data) }] } }] }) };
    }
  });
  const run = async (email, fn, ...args) => {
    const out = await rt.run(fn, args, { email });
    return { value: typeof out.value === 'string' ? JSON.parse(out.value) : out.value, mails: out.mails };
  };
  return { rt, store, run, calls };
}

test('ส่ง/อนุมัติ: EDITOR ส่ง → ผู้อนุมัติของแผนกอนุมัติ/ส่งกลับ; คนอื่นอนุมัติไม่ได้; อนุมัติแล้วส่งซ้ำไม่ได้', async () => {
  const { run } = make();
  await assert.rejects(run('editor@co.th', 'apiApprovalAction', 'OPS', '2025', 'submit', ''), /ยังไม่มีความเสี่ยงในงวดนี้/);
  await assert.rejects(run('editor@co.th', 'apiApprovalAction', 'OPS', '2026', 'approve', ''), /ยังไม่ได้ส่งอนุมัติ|ไม่มีสิทธิ์อนุมัติ/);
  const sub = await run('editor@co.th', 'apiApprovalAction', 'OPS', '2026', 'submit', 'ส่งครับ');
  assert.equal(sub.value.Status, 'Submitted');
  assert.equal(sub.value.Assessor, 'editor@co.th');
  assert.deepEqual(sub.mails.map((m) => m.to), ['coo@co.th']); // แจ้งผู้อนุมัติของแผนก
  await assert.rejects(run('editor@co.th', 'apiApprovalAction', 'OPS', '2026', 'approve', ''), /ไม่มีสิทธิ์อนุมัติ/);
  await assert.rejects(run('viewer@co.th', 'apiApprovalAction', 'OPS', '2026', 'submit', ''), /สิทธิ์/);
  const ret = await run('coo@co.th', 'apiApprovalAction', 'OPS', '2026', 'return', 'แก้ KRI');
  assert.equal(ret.value.Status, 'Returned');
  await run('editor@co.th', 'apiApprovalAction', 'OPS', '2026', 'submit', '');
  const ok = await run('coo@co.th', 'apiApprovalAction', 'OPS', '2026', 'approve', '');
  assert.equal(ok.value.Status, 'Approved');
  assert.equal(ok.value.Approver, 'coo@co.th');
  await assert.rejects(run('editor@co.th', 'apiApprovalAction', 'OPS', '2026', 'submit', ''), /อนุมัติแล้ว/);
});

test('กรอก KRI: สถานะคำนวณจากเกณฑ์, Amber/Red ต้องมีคำอธิบาย, Qualitative เลือกสีเอง, งวดต้องตรงความถี่, Red แจ้งเตือน', async () => {
  const { run } = make();
  // OPS-R-001-K1: ค่าน้อยยิ่งแย่ Amber 90 / Red 80 (รายเดือน)
  let r = await run('editor@co.th', 'apiSaveKriValues', 'OPS', [{ KRI_ID: 'OPS-R-001-K1', Period: '2026-10', Value: 75 }]);
  assert.match(r.value.errors[0], /Red ต้องอธิบายสาเหตุ/);
  assert.equal(r.value.saved, 0);
  r = await run('editor@co.th', 'apiSaveKriValues', 'OPS', [
    { KRI_ID: 'OPS-R-001-K1', Period: '2026-10', Value: 75, Comment: 'ฝนตกหนัก' },
    { KRI_ID: 'OPS-R-001-K2', Period: '2026-10', Value: 'สิบ' },
    { KRI_ID: 'OPS-R-001-K2', Period: '2026-Q4', Value: 1 },
    { KRI_ID: 'OPS-R-003-K1', Period: '2026-Q4', Value: 'ผ่านบางข้อ' },
    { KRI_ID: 'FIN-R-001-K1', Period: '2026-10', Value: 1 }
  ]);
  assert.equal(r.value.saved, 1);
  assert.equal(r.value.errors.length, 4);
  assert.match(r.value.errors.join('\n'), /ค่าต้องเป็นตัวเลข/);
  assert.match(r.value.errors.join('\n'), /งวดไม่ถูกต้อง/);
  assert.match(r.value.errors.join('\n'), /เลือกสถานะ Green \/ Amber \/ Red/);
  assert.match(r.value.errors.join('\n'), /ไม่ใช่ KRI ของแผนกนี้/);
  assert.equal(r.mails.length, 1);
  assert.match(r.mails[0].subject, /KRI ระดับ Red/);
  const v = (await run('editor@co.th', 'apiKriEntry', 'OPS', '2026-10')).value;
  assert.ok(JSON.stringify(v).includes('ฝนตกหนัก'));
});

test('AI แนะนำคะแนน: ข้อมูลขั้นต่ำไม่ครบ → ถามกลับโดยไม่เรียก AI และไม่นับโควตา; Residual ไม่เกิน Inherent', async () => {
  const { run, calls, rt } = make();
  const miss = await run('editor@co.th', 'apiAiSuggest', { dept: 'OPS', mode: 'score', stage: 'inherent', draft: { Risk_Scenario: 'จอดับ' } });
  assert.equal(calls.length, 0);
  assert.ok(miss.value.questions && miss.value.questions.length);
  const today = rt.ctx.isoDate_(new Date());
  assert.equal(rt.ctx.CacheService.getScriptCache().get('aiq:' + today + ':editor@co.th'), null);
  const draft = {
    Risk_Scenario: 'จอ LED ดับต่อเนื่องเกิน 4 ชั่วโมงช่วงฝนตกหนัก', Consequences: 'ชดเชยลูกค้า', Incident_Count: '2', Incident_Examples: 'ก.ย. 2569 จอดับ 2 จุด',
    Impact_Dimensions: 'Financial', Inherent_Impact: 2, Inherent_Likelihood: 2,
    Existing_Control: 'Preventive: ตรวจซีลทุกเดือน (ทีมซ่อม, checklist)\nDetective: แจ้งเตือนจอดับ (NOC)\nCorrective: ทีมเวร 24 ชม. (ticket)'
  };
  const res = await run('editor@co.th', 'apiAiSuggest', { dept: 'OPS', mode: 'score', stage: 'residual', draft });
  assert.equal(calls.length, 1);
  assert.deepEqual(res.value.scores, { Residual_Impact: 2, Residual_Likelihood: 2 }); // AI ให้ Impact 3 → ถูกจำกัดที่ Inherent
  assert.ok(res.value.notes.some((n) => /สูงกว่า Inherent/.test(n)));
});

test('AI: จำกัดจำนวนครั้งต่อผู้ใช้ต่อวัน (AI_DAILY_LIMIT)', async () => {
  const { run } = make((s) => { s.Settings.push({ _row: 999, Key: 'AI_DAILY_LIMIT', Value: '1' }); });
  const draft = { Risk_Scenario: 'ระบบ CMS ล่มเกิน 4 ชั่วโมง ทำให้เปลี่ยนโฆษณาไม่ได้' };
  await run('editor@co.th', 'apiAiSuggest', { dept: 'OPS', mode: 'classify', draft });
  await assert.rejects(run('editor@co.th', 'apiAiSuggest', { dept: 'OPS', mode: 'classify', draft }), /ใช้ AI ครบ 1 ครั้ง/);
});

test('ความเสี่ยงใหม่เป็น New Risk เสมอ และย้ายแผนกผ่านหน้าเว็บไม่ได้', async () => {
  const { run, store } = make();
  const risk = (await run('editor@co.th', 'apiGetRisk', 'OPS-R-003')).value.risk;
  risk.Assess_Mode = 'Reassessment';
  await run('admin@co.th', 'apiSaveRisk', { dept: 'FIN', risk: Object.assign({}, risk, { Risk_ID: '', Mitigation_Plan: 'x', Mitigation_Due_Date: '2026-12-31' }), kris: [] });
  const rows = await store.load('Risks');
  const created = rows.find((r) => r.Risk_ID === 'FIN-R-002');
  assert.equal(created.Assess_Mode, 'New Risk');
  await run('admin@co.th', 'apiSaveRisk', { dept: 'FIN', risk: Object.assign({}, risk, { Mitigation_Plan: 'x', Mitigation_Due_Date: '2026-12-31' }), kris: [] });
  assert.equal((await store.load('Risks')).find((r) => r.Risk_ID === 'OPS-R-003').Business_Unit, 'OPS');
});

test('นำเข้าจาก Google Sheet: ตรวจสอบก่อน (ไม่บันทึก) → ยืนยันแล้วบันทึกตามที่ตรวจ; เฉพาะ ADMIN', async () => {
  const header = Array.from({ length: 28 }, (_, i) => 'H' + i);
  const r1 = Array.from({ length: 28 }, () => ''); Object.assign(r1, { 1: '2026', 2: 'OPS', 6: 'จอดับ', 4: 'Operational risk', 5: 'IT system outage', 23: 'KRI ก' });
  const r2 = Array.from({ length: 28 }, () => ''); Object.assign(r2, { 2: 'OPS', 3: 'OPS-R-001', 6: 'มีแล้ว' });
  const seed = JSON.parse(JSON.stringify(SEED));
  const store = new MemoryStore(seed);
  const rt = createRuntime({ store, props: {}, fetchImpl: async () => ({ code: 500, body: '' }), sheetLoader: async (id, name) => (name === 'RISK_REGISTER' ? [header, r1, r2] : null) });
  const url = 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit';
  const before = store.commits;
  const pre = JSON.parse((await rt.run('apiImportLegacy', [url, '2026', true], { email: 'admin@co.th' })).value);
  assert.equal(pre.dryRun, true);
  assert.equal(pre.risks, 1);
  assert.equal(pre.skipped, 1);
  assert.equal(store.commits, before, 'ตรวจสอบต้องไม่บันทึก');
  const done = JSON.parse((await rt.run('apiImportLegacy', [url, '2026', false], { email: 'admin@co.th' })).value);
  assert.equal(done.dryRun, false);
  assert.deepEqual(done.rows.map((x) => x.riskId), pre.rows.map((x) => x.riskId));
  assert.ok((await store.load('Risks')).some((x) => x.Risk_ID === pre.rows[0].riskId));
  await assert.rejects(rt.run('apiImportLegacy', [url, '2026', true], { email: 'editor@co.th' }), /ADMIN|สิทธิ์/);
});
