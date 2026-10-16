const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./load')();
const plain = (x) => JSON.parse(JSON.stringify(x));

const TAX = [
  { Risk_Type: 'ESG risk', Risk_Subtype: 'Waste & e-waste' },
  { Risk_Type: 'ESG risk', Risk_Subtype: 'Ethics & anti-corruption' },
  { Risk_Type: 'Operational risk', Risk_Subtype: 'IT outage' }
];
const SCALES = G.scaleSeed_().map((r) => ({ Dimension: r[0], Level: r[1], Sub_Dimension: r[2], Label: r[3], Description: r[4] }));
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
    residual_impact: 3, residual_impact_rationale: 'rr', residual_likelihood: 2, residual_likelihood_rationale: 'rl',
    mitigation_plan: 'mp', notes: 'ตรวจตัวเลข', control_preventive: '', control_detective: '', control_corrective: '', questions: [],
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

test('AI แนะนำคะแนน: prompt ใช้เกณฑ์บริษัท 5 มิติ + หน่วยงาน และต้องมี Scenario', () => {
  const ctx = Object.assign({}, CTX, { deptDesc: 'ดูแลจอ LED ริมถนน' });
  const p = G.buildSuggestPrompt_({ mode: 'score', draft: { Risk_Scenario: 'จอดับ', Existing_Control: 'Detective: แจ้งเตือนอัตโนมัติ', Assess_Mode: 'Reassessment' } }, ctx);
  assert.equal(p.schemaName, 'risk_score');
  assert.match(p.user, /เกณฑ์ Impact ของบริษัท \(ใช้คะแนนสูงสุดของมิติที่กระทบจริง\)/);
  assert.match(p.user, /Financial: สูญเสียหรือค่าใช้จ่ายต่ำกว่า 1% ของกำไร/);
  assert.match(p.user, /โอกาสเกิดในปีนี้ > 80%/);
  assert.match(p.user, /หน้าที่ของหน่วยงาน: ดูแลจอ LED ริมถนน/);
  assert.match(p.system, /Plan B Media/);
  assert.match(p.system, /status = need_info/);
  assert.match(p.system, /เหตุการณ์จริง\/near miss/);           // กติกา Reassessment
  assert.deepEqual(Object.keys(p.schema.properties).sort(), plain(p.schema.required).sort());
  assert.throws(() => G.buildSuggestPrompt_({ mode: 'score', draft: {} }, CTX), /Risk Scenario/);
});

const scored = (over) => Object.assign({
  status: 'scored', questions: [], guidance: '',
  inherent_impact_by_dimension: { financial: 2, legal: 0, reputation: 4, operations: 3, esg: 0 }, inherent_impact_reason: 'ir',
  inherent_likelihood: 4, inherent_likelihood_reason: 'il',
  residual_impact_by_dimension: { financial: 2, legal: 0, reputation: 3, operations: 2, esg: 0 }, residual_impact_reason: 'rr',
  residual_likelihood: 5, residual_likelihood_reason: 'rl',
  confidence: 'medium', missing_info: 'สถิติ'
}, over || {});

test('validateScoreSuggestion_: Impact = มิติสูงสุด, Residual ≤ Inherent, เตือนเมื่อ Residual > Medium', () => {
  const s = G.validateScoreSuggestion_(scored());
  assert.equal(s.status, 'scored');
  assert.equal(s.scores.Inherent_Impact, 4);                 // max(2,4,3)
  assert.equal(s.scores.Residual_Impact, 3);
  assert.equal(s.scores.Residual_Likelihood, 4);             // 5 > 4 → ปรับลง
  assert.equal(s.byDimension.Inherent.Reputation, 4);
  assert.deepEqual(plain(s.inherent), { score: 16, level: 'High' });
  assert.deepEqual(plain(s.residual), { score: 12, level: 'High' });
  assert.match(s.notes.join(), /Likelihood/);
  assert.match(s.notes.join(), /Mitigation plan/);           // High > Medium
  assert.equal(s.reasons.Inherent_Impact_Rationale, 'ir');
  assert.equal(G.validateScoreSuggestion_(scored({ confidence: 'sure' })).confidence, 'low');
  const ok = G.validateScoreSuggestion_(scored({ residual_impact_by_dimension: { financial: 2, legal: 0, reputation: 0, operations: 0, esg: 0 }, residual_likelihood: 3 }));
  assert.ok(!/Mitigation/.test(ok.notes.join()));            // 2×3 = Low
});

test('validateScoreSuggestion_: need_info หรือคะแนนไม่ครบ → ไม่มีคะแนน มีแต่คำถาม', () => {
  const n = G.validateScoreSuggestion_(scored({ status: 'need_info', questions: ['เกิดกี่ครั้ง?'], guidance: 'กรอบคิด' }));
  assert.equal(n.status, 'need_info');
  assert.equal(n.scores, undefined);
  assert.deepEqual(plain(n.questions), ['เกิดกี่ครั้ง?']);
  const z = G.validateScoreSuggestion_(scored({ inherent_impact_by_dimension: { financial: 0, legal: 0, reputation: 9, operations: 0, esg: 0 } }));
  assert.equal(z.status, 'need_info');                       // 9 นอกช่วง → ไม่มีมิติใดถูกให้คะแนน
  assert.ok(z.questions.length);
});

test('intakeResponse_: คำถามตามข้อมูลที่ขาด', () => {
  const miss = G.missingIntake_(G.normalizeRisk_({ Assess_Mode: 'Reassessment', Risk_Scenario: 'x' }));
  const r = G.intakeResponse_(miss, 'Reassessment');
  assert.equal(r.status, 'need_info');
  assert.equal(r.local, true);
  assert.equal(r.questions.length, 4);
  assert.match(r.guidance, /Reassessment/);
});

test('ช่วยร่าง: control แยก P/D/C และคะแนนที่ไม่มีเหตุผลถือว่ายังไม่ได้ให้', () => {
  const s = G.validateSuggestion_(aiDraft({ control_preventive: 'ตรวจซีลก่อนหน้าฝน', control_detective: 'ระบบแจ้งเตือน', control_corrective: '',
    residual_impact_rationale: '', questions: ['มีสถิติจอดับไหม?'] }), TAX);
  assert.equal(s.risk.Existing_Control, 'Preventive: ตรวจซีลก่อนหน้าฝน\nDetective: ระบบแจ้งเตือน');
  assert.equal(s.risk.Residual_Impact, '');                  // ไม่มี rationale → ไม่ใช้คะแนน
  assert.deepEqual(plain(s.questions), ['มีสถิติจอดับไหม?']);
  const none = G.validateSuggestion_(aiDraft({ inherent_impact: 0, inherent_likelihood: 0, residual_impact: 0, residual_likelihood: 0 }), TAX);
  assert.equal(none.risk.Inherent_Impact, '');
  assert.match(none.notes.join(), /ข้อมูลไม่พอ/);
  const p = G.buildSuggestPrompt_({ mode: 'draft', brief: 'x', draft: {} }, CTX);
  assert.ok(p.schema.required.includes('control_preventive'));
  assert.match(p.system, /ถ้าข้อมูลไม่พอให้ใส่ 0/);
});

test('ตรวจ (review): improved existing_control กลับเข้าช่อง Existing_Control', () => {
  const r = G.validateRiskReview_({ criteria: [{ name: 'a', result: 'yes', comment: '' }], summary: '', issues: [],
    improved: { risk_scenario: '', risk_cause: '', consequences: '', existing_control: 'Preventive: x', mitigation_plan: '' } }, ['a']);
  assert.deepEqual(plain(r.improved), { Existing_Control: 'Preventive: x' });
  assert.ok(G.AI_DEFAULT_CRITERIA.RISK.some((c) => /Preventive \/ Detective \/ Corrective/.test(c)));
  assert.ok(G.AI_DEFAULT_CRITERIA.RISK.some((c) => /สูงกว่า Medium/.test(c)));
});

const TAX_FULL = [
  { Risk_Type: 'Operational risk', L2_Domain: 'Operations', Risk_Subtype: 'Asset maintenance & uptime', Description_TH: 'ความพร้อมใช้งานของจอ' },
  { Risk_Type: 'Operational risk', L2_Domain: 'Technology', Risk_Subtype: 'IT outage', Description_TH: 'ระบบล่ม' },
  { Risk_Type: 'ESG risk', L2_Domain: 'Environmental', Risk_Subtype: 'Physical climate / natural hazards', Description_TH: 'ภัยธรรมชาติ' }
];

test('AI แนะนำประเภท: prompt มี Taxonomy พร้อมคำอธิบายและ Scenario; ต้องมี Scenario', () => {
  const p = G.buildSuggestPrompt_({ mode: 'classify', draft: { Risk_Scenario: 'จอ LED ดับช่วงฝนตกหนัก', Risk_Cause: 'น้ำเข้าตู้ไฟ' } },
    Object.assign({}, CTX, { taxonomy: TAX_FULL }));
  assert.equal(p.schemaName, 'risk_classify');
  assert.match(p.user, /1\. Operational risk \| Operations \| Asset maintenance & uptime — ความพร้อมใช้งานของจอ/);
  assert.match(p.user, /Risk Scenario: จอ LED ดับช่วงฝนตกหนัก/);
  assert.match(p.user, /Risk cause: น้ำเข้าตู้ไฟ/);
  assert.match(p.system, /คัดลอกจากรายการ Taxonomy/);
  const item = p.schema.properties.candidates.items;
  assert.deepEqual(Object.keys(item.properties).sort(), plain(item.required).sort());
  assert.throws(() => G.buildSuggestPrompt_({ mode: 'classify', draft: { Risk_Scenario: 'สั้น' } }, CTX), /Risk Scenario/);
});

test('validateClassify_: เฉพาะคู่ใน Taxonomy, แก้ Type จาก Sub-type, ตัดซ้ำ, สูงสุด 3', () => {
  const r = G.validateClassify_({ candidates: [
    { risk_type: 'Operational risk', risk_subtype: 'Asset maintenance & uptime', confidence: 'high', reason: 'จอดับ' },
    { risk_type: 'Made up', risk_subtype: 'Physical climate / natural hazards', confidence: 'medium', reason: 'ฝน' },   // แก้ Type ให้
    { risk_type: 'Operational risk', risk_subtype: 'Asset maintenance & uptime', confidence: 'low', reason: 'ซ้ำ' },
    { risk_type: 'X', risk_subtype: 'Not in taxonomy', confidence: 'high', reason: 'ไม่มีจริง' },
    { risk_type: 'Operational risk', risk_subtype: 'IT outage', confidence: 'weird', reason: 'cms' }
  ] }, TAX_FULL);
  assert.deepEqual(plain(r.candidates.map((c) => c.subtype)), ['Asset maintenance & uptime', 'Physical climate / natural hazards', 'IT outage']);
  assert.equal(r.candidates[1].type, 'ESG risk');
  assert.equal(r.candidates[0].l2, 'Operations');
  assert.equal(r.candidates[0].desc, 'ความพร้อมใช้งานของจอ');
  assert.equal(r.candidates[2].confidence, 'low');
  assert.equal(r.notes.length, 0);
  const none = G.validateClassify_({ candidates: [{ risk_type: 'X', risk_subtype: 'Y', confidence: 'high', reason: '' }] }, TAX_FULL);
  assert.equal(none.candidates.length, 0);
  assert.match(none.notes[0], /เลือกเอง/);
  assert.equal(G.validateClassify_(null, TAX_FULL).candidates.length, 0);
});
