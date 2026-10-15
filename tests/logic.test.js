const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./load')();
const plain = (x) => JSON.parse(JSON.stringify(x));

test('riskScore_ / riskLevel_ ตรงกับชีต MATRIX ทุกช่อง', () => {
  const expect = (s) => (s <= 6 ? 'Low' : s <= 11 ? 'Moderate' : s <= 19 ? 'High' : 'Very High');
  for (let i = 1; i <= 5; i++) for (let l = 1; l <= 5; l++) {
    const s = G.riskScore_(i, l);
    assert.equal(s, i * l);
    assert.equal(G.riskLevel_(s).key, expect(s));
  }
  assert.equal(G.riskScore_('3 (ปานกลาง)', '4'), 12);
  assert.equal(G.riskScore_('', 3), null);
  assert.equal(G.riskScore_(6, 3), null);
  assert.equal(G.riskLevel_(20).reporting, 'RMC & BOD');
  assert.equal(G.riskLevel_(7).reporting, 'CEO & MD');
});

test('งวด KRI: รายเดือน / รายไตรมาส / กำหนดกรอก', () => {
  assert.equal(G.periodFor_('Monthly', '2026-10-15'), '2026-10');
  assert.equal(G.periodFor_('Quarterly', '2026-10-15'), '2026-Q4');
  assert.equal(G.reportingPeriod_('Monthly', '2026-10-15'), '2026-09');
  assert.equal(G.reportingPeriod_('Monthly', '2026-01-03'), '2025-12');
  assert.equal(G.reportingPeriod_('Quarterly', '2026-10-15'), '2026-Q3');
  assert.equal(G.reportingPeriod_('Quarterly', '2026-02-01'), '2025-Q4');
  assert.deepEqual(plain(G.periodRange_('2026-Q1')), { start: '2026-01-01', end: '2026-03-31', nextFirst: '2026-04-01' });
  assert.deepEqual(plain(G.periodRange_('2026-12')), { start: '2026-12-01', end: '2026-12-31', nextFirst: '2027-01-01' });
  assert.equal(G.periodDueDate_('2026-09', 10), '2026-10-10');
  assert.equal(G.periodDueDate_('2026-Q4', 10), '2027-01-10');
  assert.deepEqual(plain(G.recentPeriods_('Monthly', '2026-02-10', 3)), ['2026-01', '2025-12', '2025-11']);
  assert.equal(G.prevPeriod_('2026-Q1'), '2025-Q4');
});

test('kriStatus_: ค่ามากยิ่งแย่ / ค่าน้อยยิ่งแย่ / Qualitative และค่าขอบ', () => {
  const hw = { Direction: 'Higher_Worse', Amber_Threshold: '5', Red_Threshold: '10' };
  assert.equal(G.kriStatus_(hw, 4.99), 'Green');
  assert.equal(G.kriStatus_(hw, 5), 'Amber');
  assert.equal(G.kriStatus_(hw, '9'), 'Amber');
  assert.equal(G.kriStatus_(hw, 10), 'Red');
  const lw = { Direction: 'Lower_Worse', Amber_Threshold: 95, Red_Threshold: 90 };
  assert.equal(G.kriStatus_(lw, 96), 'Green');
  assert.equal(G.kriStatus_(lw, 95), 'Amber');
  assert.equal(G.kriStatus_(lw, 90), 'Red');
  const q = { Direction: 'Qualitative' };
  assert.equal(G.kriStatus_(q, 'มีเหตุ', 'Amber'), 'Amber');
  assert.equal(G.kriStatus_(q, 'x', 'Purple'), '');
  // ยังไม่ตั้ง threshold → ใช้สถานะที่เลือกเอง
  assert.equal(G.kriStatus_({ Direction: 'Higher_Worse' }, 3, 'Green'), 'Green');
});

test('kriThresholdText_ สร้างข้อความเกณฑ์อัตโนมัติ แต่ใช้ข้อความที่กรอกเองก่อน', () => {
  const t = G.kriThresholdText_({ Direction: 'Higher_Worse', Amber_Threshold: 5, Red_Threshold: 10, Unit: 'ครั้ง' });
  assert.equal(t.Red, '≥ 10 ครั้ง');
  assert.equal(t.Green, '< 5 ครั้ง');
  const t2 = G.kriThresholdText_({ Direction: 'Qualitative', Green_Text: 'ไม่มีข้อร้องเรียน' });
  assert.equal(t2.Green, 'ไม่มีข้อร้องเรียน');
  assert.equal(t2.Red, '');
});

const TAX = [{ Risk_Type: 'ESG risk', Risk_Subtype: 'Waste & e-waste' }, { Risk_Type: 'Operational risk', Risk_Subtype: 'IT outage' }];

function goodRisk(over) {
  return G.normalizeRisk_(Object.assign({
    Risk_Type: 'ESG risk', Risk_Subtype: 'Waste & e-waste', Risk_Scenario: 'S', Risk_Cause: 'C', Consequences: 'Q',
    Inherent_Impact: 4, Inherent_Impact_Rationale: 'r', Inherent_Likelihood: 4, Inherent_Likelihood_Rationale: 'r',
    Existing_Control: 'ctl', Residual_Impact: 2, Residual_Impact_Rationale: 'r', Residual_Likelihood: 3, Residual_Likelihood_Rationale: 'r',
    Risk_Owner: 'ผจก.'
  }, over || {}));
}
const kri = (o) => G.normalizeKri_(Object.assign({ KRI_Name: 'k', KRI_Type: 'Leading', Direction: 'Higher_Worse', Amber_Threshold: 1, Red_Threshold: 2 }, o || {}));

test('normalizeRisk_ คำนวณ score/level และวันที่', () => {
  const r = goodRisk({ Mitigation_Due_Date: '2026-12-31', Mitigation_Plan: 'p' });
  assert.equal(r.Inherent_Score, 16);
  assert.equal(r.Inherent_Level, 'High');
  assert.equal(r.Residual_Score, 6);
  assert.equal(r.Residual_Level, 'Low');
  assert.equal(r.Mitigation_Status, 'Not Started');
  assert.equal(G.normalizeRisk_({ Inherent_Impact: '9' }).Inherent_Impact, '');
});

test('validateRisk_: ช่องบังคับ, Taxonomy, High+ ต้องมีแผน, คำเตือน', () => {
  assert.deepEqual(plain(G.validateRisk_(goodRisk(), [kri()], TAX, '2026-10-15').errors), []);
  const v1 = G.validateRisk_(G.normalizeRisk_({}), [], TAX, '2026-10-15');
  assert.ok(v1.errors.length >= 10);
  const v2 = G.validateRisk_(goodRisk({ Risk_Subtype: 'IT outage' }), [kri()], TAX);
  assert.match(v2.errors.join(), /Taxonomy/);
  const v3 = G.validateRisk_(goodRisk({ Residual_Impact: 4, Residual_Likelihood: 4 }), [kri()], TAX);
  assert.match(v3.errors.join(), /Mitigation plan/);
  const v4 = G.validateRisk_(goodRisk({ Residual_Impact: 5, Residual_Likelihood: 5, Mitigation_Plan: 'x', Mitigation_Due_Date: '2026-01-01' }), [kri({ KRI_Type: 'Lagging' })], TAX, '2026-10-15');
  assert.deepEqual(plain(v4.errors), []);
  assert.match(v4.warnings.join(), /สูงกว่า Inherent/);
  assert.match(v4.warnings.join(), /เลยกำหนด/);
  assert.match(v4.warnings.join(), /Leading/);
  assert.match(G.validateRisk_(goodRisk(), [], TAX).warnings.join(), /ยังไม่มี KRI/);
});

test('validateKri_: ลำดับ threshold ตามทิศทาง', () => {
  assert.equal(G.validateKri_(kri()).length, 0);
  assert.match(G.validateKri_(kri({ Amber_Threshold: 3, Red_Threshold: 2 })).join(), /น้อยกว่า Red/);
  assert.match(G.validateKri_(kri({ Direction: 'Lower_Worse', Amber_Threshold: 1, Red_Threshold: 2 })).join(), /มากกว่า Red/);
  assert.match(G.validateKri_(kri({ Red_Threshold: '' })).join(), /Amber และ Red/);
  assert.equal(G.validateKri_(kri({ Direction: 'Qualitative', Red_Threshold: '' })).length, 0);
  assert.match(G.validateKri_(kri({ Owner_Email: 'abc' })).join(), /อีเมล/);
});

test('รหัส Risk / KRI / แผนก', () => {
  assert.equal(G.nextRiskId_('FIN', ['FIN-R-001', 'FIN-R-009', 'HR-R-020']), 'FIN-R-010');
  assert.equal(G.nextRiskId_('HR', []), 'HR-R-001');
  assert.equal(G.nextKriId_('FIN-R-001', ['FIN-R-001-K1', 'FIN-R-001-K3', 'FIN-R-0011-K9']), 'FIN-R-001-K4');
  assert.equal(G.deptCodeFromName_('Finance & Accounting', ['FINANC']), 'FINANC2');
  assert.equal(G.deptCodeFromName_('ฝ่ายบัญชี', []), 'BU');
});

test('Util: isoDate_ ใช้เวลาไทย, level_, hash_', () => {
  assert.equal(G.isoDate_('2026-09-30T17:00:00.000Z'), '2026-10-01');
  assert.equal(G.isoDate_('2026-10-01'), '2026-10-01');
  assert.equal(G.isoDate_(''), '');
  assert.equal(G.level_('5 (สูงมาก)'), 5);
  assert.equal(G.level_('0'), null);
  assert.equal(G.hash_('abc'), G.hash_('abc'));
  assert.notEqual(G.hash_('abc'), G.hash_('abd'));
  assert.equal(G.safeCell_('=IMPORTXML(1)'), "'=IMPORTXML(1)");
  assert.equal(G.safeCell_('- bullet'), '- bullet');
  assert.equal(G.isActive_(''), true);
  assert.equal(G.isActive_('FALSE'), false);
});

test('mergeConfig_: ลำดับ Settings > Script Properties > DEFAULTS', () => {
  const c = G.mergeConfig_({ KRI_DUE_DAY: '15', AI_PROVIDER: 'OpenAI', ANTHROPIC_API_KEY: 'x' }, { KRI_DUE_DAY: '20', ASSESSMENT_PERIOD: '' }, new Date('2026-10-15T00:00:00Z'));
  assert.equal(c.KRI_DUE_DAY, 20);
  assert.equal(c.AI_PROVIDER, 'openai');
  assert.equal(c.AI_MODEL, 'gpt-4.1-mini');
  assert.equal(c.ASSESSMENT_PERIOD, '2026');
  assert.equal(c.ANTHROPIC_API_KEY, undefined);
});

test('legacyRowToRisk_ / riskToLegacyRow_ แปลงไป-กลับคอลัมน์ A–AB ของ Sheet เดิม', () => {
  const row = ['1', '2026', 'Finance', 'FIN-01', 'ESG risk', 'Waste & e-waste', 'scenario', 'cause', 'conseq',
    '4 (สูง)', 'ir', '3 (ปานกลาง)', 'lr', '-', 'ctrl', '2', 'rir', '2', 'rlr', '-', 'plan', '2026-12-31', 'owner',
    'leading kri', 'lagging kri', 'g', 'a', 'r'];
  const x = G.legacyRowToRisk_(row);
  assert.equal(x.riskId, 'FIN-01');
  assert.equal(x.businessUnit, 'Finance');
  assert.equal(x.risk.Inherent_Score, 12);
  assert.equal(x.risk.Inherent_Level, 'High');
  assert.equal(x.risk.Residual_Level, 'Low');
  assert.equal(x.leading, 'leading kri');
  const r = Object.assign({ Risk_No: 1, Assessment_Period: '2026', Business_Unit: 'FIN', Risk_ID: 'FIN-01' }, x.risk);
  const kris = [
    { KRI_Type: 'Leading', KRI_Name: 'L1', Unit: '%', Direction: 'Higher_Worse', Amber_Threshold: 5, Red_Threshold: 10, Is_Active: 'TRUE' },
    { KRI_Type: 'Lagging', KRI_Name: 'G1', Direction: 'Qualitative', Green_Text: 'ok', Is_Active: 'TRUE' },
    { KRI_Type: 'Lagging', KRI_Name: 'OLD', Is_Active: 'FALSE' }
  ];
  const out = G.riskToLegacyRow_(r, kris, 'Finance');
  assert.equal(out.length, G.LEGACY_HEADERS.length);
  assert.equal(out[2], 'Finance');
  assert.equal(out[13], 'High Risk (12)');
  assert.equal(out[19], 'Low Risk (4)');
  assert.equal(out[23], '• L1 (%)');
  assert.equal(out[24], '• G1');
  assert.equal(out[25], '• L1: < 5 %\n• G1: ok');
  assert.equal(out[27], '• L1: ≥ 10 %');
});

test('DEPARTMENT_SEED: 15 หน่วยงานตาม Risk report Log รหัสไม่ซ้ำและใช้ได้กับ apiSaveDept', () => {
  assert.equal(G.DEPARTMENT_SEED.length, 15);
  const codes = G.DEPARTMENT_SEED.map((d) => d[0]);
  assert.equal(new Set(codes).size, 15);
  codes.forEach((c) => assert.match(c, /^[A-Z0-9_]{2,12}$/));
  assert.ok(G.DEPARTMENT_SEED.some((d) => d[1] === 'THAILAND PRIVILEGE CARD & IBD'));
});
