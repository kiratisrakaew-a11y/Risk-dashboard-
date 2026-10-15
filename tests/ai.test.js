const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./load')();
const plain = (x) => JSON.parse(JSON.stringify(x));

const TAX = [
  { Risk_Type: 'ESG risk', Risk_Subtype: 'Waste & e-waste' },
  { Risk_Type: 'ESG risk', Risk_Subtype: 'Ethics & anti-corruption' },
  { Risk_Type: 'Operational risk', Risk_Subtype: 'IT outage' }
];
const SCALES = G.scaleSeed_().map((r) => ({ Dimension: r[0], Level: r[1], Label: r[2], Description: r[3] }));
const CTX = { deptName: 'Finance', taxonomy: TAX, scales: SCALES };

test('aiCriteria_: ใช้ชีต AI_Criteria ถ้ามี ไม่งั้นใช้ค่าตั้งต้น', () => {
  assert.equal(G.aiCriteria_('RISK', []).length, G.AI_DEFAULT_CRITERIA.RISK.length);
  const rows = [{ Scope: 'risk', Criteria: '1. ข้อแรก\n- ข้อสอง\n\n', Is_Active: 'TRUE' }, { Scope: 'RISK', Criteria: 'ปิดแล้ว', Is_Active: 'FALSE' }];
  assert.deepEqual(plain(G.aiCriteria_('RISK', rows)), ['ข้อแรก', 'ข้อสอง']);
  assert.equal(G.aiCriteria_('KRI_COMMENT', rows).length, 3);
});

test('buildSuggestPrompt_ draft: มี Taxonomy, นิยามระดับ, คำอธิบายผู้ใช้อยู่ใน <data>', () => {
  const p = G.buildSuggestPrompt_({ mode: 'draft', brief: 'จอดับช่วงหน้าฝน', draft: { Risk_Cause: 'น้ำเข้าตู้ไฟ' } }, CTX);
  assert.match(p.user, /Operational risk: IT outage/);
  assert.match(p.user, /ESG risk: Waste & e-waste \| Ethics & anti-corruption/);
  assert.match(p.user, /<data>\nจอดับช่วงหน้าฝน\n<\/data>/);
  assert.match(p.user, /น้ำเข้าตู้ไฟ/);
  assert.match(p.user, /High Risk \(12-19\)/);
  assert.match(p.system, /ห้ามแต่งตัวเลข/);
  assert.equal(p.schemaName, 'risk_draft');
  assert.ok(p.schema.required.includes('kris'));
  // schema แบบ strict: ทุก property ต้องอยู่ใน required
  assert.deepEqual(Object.keys(p.schema.properties).sort(), plain(p.schema.required).sort());
});

test('buildSuggestPrompt_ improve: เฉพาะช่องข้อความ', () => {
  const p = G.buildSuggestPrompt_({ mode: 'improve', field: 'Mitigation_Plan', draft: { Mitigation_Plan: 'ทำ BCP' } }, CTX);
  assert.match(p.user, /ทำ BCP/);
  assert.equal(p.schemaName, 'improve_field');
  assert.throws(() => G.buildSuggestPrompt_({ mode: 'improve', field: 'Inherent_Impact', draft: {} }, CTX), /ใช้ AI ปรับ/);
  assert.throws(() => G.buildSuggestPrompt_({ mode: 'improve', field: 'Email', draft: {} }, CTX), /ใช้ AI ปรับ/);
});

function aiDraft(over) {
  return Object.assign({
    risk_scenario: 's', risk_cause: 'c', consequences: 'q', risk_type: 'ESG risk', risk_subtype: 'Waste & e-waste',
    inherent_impact: 4, inherent_impact_rationale: 'ir', inherent_likelihood: 3, inherent_likelihood_rationale: 'lr',
    existing_control: 'ctl', residual_impact: 3, residual_impact_rationale: 'rr', residual_likelihood: 2, residual_likelihood_rationale: 'rl',
    mitigation_plan: 'mp', notes: 'ตรวจตัวเลข',
    kris: [
      { kri_type: 'Leading', kri_name: 'จำนวนจอดับ', unit: 'ครั้ง/เดือน', frequency: 'Monthly', direction: 'Higher_Worse', amber_threshold: 3, red_threshold: 5, green_text: '', amber_text: '', red_text: '' },
      { kri_type: 'Lagging', kri_name: 'ค่าชดเชย', unit: 'บาท', frequency: 'Quarterly', direction: 'Higher_Worse', amber_threshold: 9, red_threshold: 2, green_text: '', amber_text: '', red_text: '' },
      { kri_type: 'Weird', kri_name: '', unit: '', frequency: 'Daily', direction: 'x', amber_threshold: null, red_threshold: null, green_text: '', amber_text: '', red_text: '' }
    ]
  }, over || {});
}

test('validateSuggestion_: แปลงฟิลด์, ตรวจ Taxonomy, แก้ KRI ที่ threshold ขัดกัน', () => {
  const s = G.validateSuggestion_(aiDraft(), TAX);
  assert.equal(s.risk.Risk_Scenario, 's');
  assert.equal(s.risk.Inherent_Impact, 4);
  assert.equal(s.risk.Risk_Subtype, 'Waste & e-waste');
  assert.equal(s.kris.length, 2);                       // ตัดชื่อว่างทิ้ง
  assert.equal(s.kris[0].Direction, 'Higher_Worse');
  assert.equal(s.kris[1].Direction, 'Qualitative');     // amber 9 > red 2 ขัดกัน
  assert.equal(s.notes[0], 'ตรวจตัวเลข');
  assert.match(s.notes.join(), /ค่าชดเชย/);

  const bad = G.validateSuggestion_(aiDraft({ risk_type: 'Made up', risk_subtype: 'Nope' }), TAX);
  assert.equal(bad.risk.Risk_Type, '');
  assert.equal(bad.risk.Risk_Subtype, '');
  assert.match(bad.notes.join(), /ไม่อยู่ใน Taxonomy/);

  const fix = G.validateSuggestion_(aiDraft({ risk_type: 'Wrong', risk_subtype: 'IT outage' }), TAX);
  assert.equal(fix.risk.Risk_Type, 'Operational risk'); // เดาจาก Sub-type ที่ไม่ซ้ำ

  const up = G.validateSuggestion_(aiDraft({ residual_impact: 5, residual_likelihood: 5 }), TAX);
  assert.match(up.notes.join(), /Residual สูงกว่า/);
  assert.equal(G.validateSuggestion_(aiDraft({ inherent_impact: 7 }), TAX).risk.Inherent_Impact, '');
});

test('validateRiskReview_: ระบบคิดคะแนนเอง ไม่เชื่อโมเดล และจับคู่เกณฑ์ที่มีเลขนำหน้า', () => {
  const crit = ['ก', 'ข', 'ค', 'ง'];
  const r = G.validateRiskReview_({
    criteria: [{ name: '1. ก', result: 'yes', comment: '' }, { name: 'ข', result: 'partial', comment: 'x' }, { name: 'ค', result: 'maybe', comment: '' }],
    summary: 'sum', score: 100,
    issues: [{ field: 'Risk_Scenario', problem: 'กว้างไป', suggestion: 'ระบุ' }, { field: 'x', problem: '', suggestion: '' }],
    improved: { risk_scenario: 'ใหม่', risk_cause: '', consequences: '', existing_control: '', mitigation_plan: 'แผนใหม่' }
  }, crit);
  assert.equal(r.score, 38);                            // (1 + 0.5 + 0 + 0) / 4
  assert.equal(r.grade, 'D');
  assert.equal(r.criteria[3].comment, '(AI ไม่ได้ประเมินเกณฑ์นี้)');
  assert.equal(r.issues.length, 1);
  assert.deepEqual(plain(r.improved), { Risk_Scenario: 'ใหม่', Mitigation_Plan: 'แผนใหม่' });
  assert.throws(() => G.validateRiskReview_({ criteria: [] }, crit), /ผลรายเกณฑ์/);
});

test('buildReviewPrompt_ ใส่เกณฑ์ครบ + ข้อมูล KRI', () => {
  const risk = G.normalizeRisk_({ Risk_Scenario: 'จอดับ', Inherent_Impact: 4, Inherent_Likelihood: 4 });
  const kris = [G.normalizeKri_({ KRI_Name: 'จอดับ/เดือน', Amber_Threshold: 3, Red_Threshold: 5, Unit: 'ครั้ง' })];
  const p = G.buildReviewPrompt_(risk, kris, ['เกณฑ์ A', 'เกณฑ์ B'], CTX);
  assert.match(p.user, /1\. เกณฑ์ A\n2\. เกณฑ์ B/);
  assert.match(p.user, /Inherent risk level \(ระบบคำนวณ\): 16 = High/);
  assert.match(p.user, /\[Leading\] จอดับ\/เดือน \(ครั้ง\).*Red: ≥ 5 ครั้ง/);
});

test('riskFingerprint_: เปลี่ยนเมื่อเนื้อหา/KRI/เกณฑ์เปลี่ยน ไม่สนชนิดข้อมูลจาก Sheet', () => {
  const crit = ['a'];
  const saved = { Risk_Scenario: 'x', Inherent_Impact: '3', Mitigation_Status: 'Done' };
  const kSaved = [{ KRI_Name: 'k', Amber_Threshold: '1', Red_Threshold: '2', Is_Active: 'TRUE' }, { KRI_Name: 'off', Is_Active: 'FALSE' }];
  const draft = { Risk_Scenario: 'x', Inherent_Impact: 3, Mitigation_Status: 'In Progress' };
  const kDraft = [{ KRI_Name: 'k', Amber_Threshold: 1, Red_Threshold: 2, Is_Active: true }];
  const h = G.riskFingerprint_(saved, kSaved, crit);
  assert.equal(h, G.riskFingerprint_(draft, kDraft, crit));       // สถานะแผนไม่เกี่ยวกับคุณภาพการเขียน
  assert.notEqual(h, G.riskFingerprint_(Object.assign({}, draft, { Risk_Scenario: 'y' }), kDraft, crit));
  assert.notEqual(h, G.riskFingerprint_(draft, [], crit));
  assert.notEqual(h, G.riskFingerprint_(draft, kDraft, ['b']));
});

test('buildKriCommentPrompt_', () => {
  const p = G.buildKriCommentPrompt_({ KRI_Type: 'Leading', KRI_Name: 'จอดับ', Unit: 'ครั้ง' },
    { Period: '2026-09', Value: 7, Status: 'Red', Comment: 'ฝนตกหนัก', Action_Taken: '' }, { Risk_Scenario: 'จอดับ' }, ['ก']);
  assert.match(p.user, /งวด: 2026-09 · ค่า: 7 · สถานะ: Red/);
  assert.match(p.user, /Action taken\): \(ว่าง\)/);
  assert.equal(p.schemaName, 'kri_comment_review');
});

test('AI แนะนำคะแนน: prompt ใช้นิยามระดับ และต้องมี Scenario', () => {
  const p = G.buildSuggestPrompt_({ mode: 'score', draft: { Risk_Scenario: 'จอดับ', Existing_Control: 'แจ้งเตือนอัตโนมัติ', Inherent_Impact: 2 } }, CTX);
  assert.equal(p.schemaName, 'risk_score');
  assert.match(p.user, /นิยามระดับ Impact/);
  assert.match(p.user, /แจ้งเตือนอัตโนมัติ/);
  assert.match(p.system, /Residual ต้องไม่สูงกว่า Inherent/);
  assert.deepEqual(Object.keys(p.schema.properties).sort(), plain(p.schema.required).sort());
  assert.throws(() => G.buildSuggestPrompt_({ mode: 'score', draft: {} }, CTX), /Risk Scenario/);
});

test('validateScoreSuggestion_: คิดระดับ, ปรับ Residual ที่สูงกว่า Inherent, ปฏิเสธระดับนอกช่วง', () => {
  const ok = {
    inherent_impact: 4, inherent_impact_reason: 'ir', inherent_likelihood: 4, inherent_likelihood_reason: 'il',
    residual_impact: 3, residual_impact_reason: 'rr', residual_likelihood: 5, residual_likelihood_reason: 'rl',
    confidence: 'medium', missing_info: 'สถิติ'
  };
  const s = G.validateScoreSuggestion_(ok);
  assert.equal(s.scores.Inherent_Impact, 4);
  assert.equal(s.scores.Residual_Likelihood, 4);           // 5 > 4 → ปรับลง
  assert.match(s.notes.join(), /Likelihood/);
  assert.deepEqual(plain(s.inherent), { score: 16, level: 'High' });
  assert.deepEqual(plain(s.residual), { score: 12, level: 'High' });
  assert.equal(s.reasons.Inherent_Impact_Rationale, 'ir');
  assert.equal(s.confidence, 'medium');
  assert.equal(G.validateScoreSuggestion_(Object.assign({}, ok, { confidence: 'sure' })).confidence, 'low');
  assert.throws(() => G.validateScoreSuggestion_(Object.assign({}, ok, { inherent_impact: 6 })), /1-5/);
});
