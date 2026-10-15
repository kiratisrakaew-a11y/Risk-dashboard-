/**
 * RiskLogic — กติกาคำนวณ/ตรวจข้อมูล (pure function มี unit test)
 */

// ============================ Risk score / level ============================

function riskScore_(impact, likelihood) {
  var i = level_(impact), l = level_(likelihood);
  return i && l ? i * l : null;
}

/** ระดับความเสี่ยงตามชีต MATRIX: Low 1–6 / Moderate 7–11 / High 12–19 / Very High 20–25 */
function riskLevel_(score) {
  if (!score) return null;
  for (var i = 0; i < RISK_LEVELS.length; i++) {
    if (score >= RISK_LEVELS[i].min && score <= RISK_LEVELS[i].max) return RISK_LEVELS[i];
  }
  return null;
}

function levelRank_(key) {
  for (var i = 0; i < RISK_LEVELS.length; i++) if (RISK_LEVELS[i].key === key) return i;
  return -1;
}

// ============================ งวด KRI ============================

function monthPeriod_(iso) { return String(iso).slice(0, 7); }

function quarterPeriod_(iso) {
  var m = Number(String(iso).slice(5, 7));
  return String(iso).slice(0, 4) + '-Q' + Math.ceil(m / 3);
}

function periodFor_(freq, iso) { return freq === 'Quarterly' ? quarterPeriod_(iso) : monthPeriod_(iso); }

/** วันแรก / วันสุดท้ายของงวด */
function periodRange_(period) {
  var y = Number(period.slice(0, 4)), startM, endM;
  var q = period.match(/^\d{4}-Q([1-4])$/);
  if (q) { startM = (Number(q[1]) - 1) * 3 + 1; endM = startM + 2; }
  else { startM = endM = Number(period.slice(5, 7)); }
  var start = y + '-' + ('0' + startM).slice(-2) + '-01';
  var nextFirst = endM === 12 ? (y + 1) + '-01-01' : y + '-' + ('0' + (endM + 1)).slice(-2) + '-01';
  return { start: start, end: addDays_(nextFirst, -1), nextFirst: nextFirst };
}

/** งวดก่อนหน้า */
function prevPeriod_(period) {
  return periodFor_(/Q/.test(period) ? 'Quarterly' : 'Monthly', addDays_(periodRange_(period).start, -1));
}

/** งวดล่าสุดที่ปิดแล้ว = งวดที่ต้องรายงาน ณ วันนี้ (เช่น เดือน ต.ค. รายงานค่าของ ก.ย.) */
function reportingPeriod_(freq, todayIso) {
  return prevPeriod_(periodFor_(freq, todayIso));
}

/** กำหนดกรอกค่าของงวด = วันที่ dueDay ของเดือนถัดจากงวด */
function periodDueDate_(period, dueDay) {
  return addDays_(periodRange_(period).nextFirst, Math.max(1, Math.min(28, Number(dueDay) || 10)) - 1);
}

/** งวดย้อนหลัง n งวด (ใหม่ → เก่า) เริ่มจากงวดที่ต้องรายงาน */
function recentPeriods_(freq, todayIso, n) {
  var out = [], p = reportingPeriod_(freq, todayIso);
  for (var i = 0; i < n; i++) { out.push(p); p = prevPeriod_(p); }
  return out;
}

// ============================ KRI status ============================

/**
 * สถานะ KRI: Higher_Worse (ค่ามากยิ่งแย่) ≥ Red → Red, ≥ Amber → Amber
 *            Lower_Worse  (ค่าน้อยยิ่งแย่) ≤ Red → Red, ≤ Amber → Amber
 *            Qualitative หรือยังไม่ตั้ง threshold → ใช้สถานะที่ผู้กรอกเลือก
 */
function kriStatus_(kri, value, manual) {
  var v = num_(value), a = num_(kri.Amber_Threshold), r = num_(kri.Red_Threshold);
  if (kri.Direction === 'Qualitative' || v === null || a === null || r === null) {
    return RAG.indexOf(manual) >= 0 ? manual : '';
  }
  if (kri.Direction === 'Lower_Worse') return v <= r ? 'Red' : v <= a ? 'Amber' : 'Green';
  return v >= r ? 'Red' : v >= a ? 'Amber' : 'Green';
}

/** ข้อความเกณฑ์ G/A/R ที่อ่านง่าย (ใช้ export และแสดงผล) */
function kriThresholdText_(k) {
  var a = num_(k.Amber_Threshold), r = num_(k.Red_Threshold), u = k.Unit ? ' ' + k.Unit : '';
  var auto = { Green: '', Amber: '', Red: '' };
  if (k.Direction === 'Higher_Worse' && a !== null && r !== null) {
    auto = { Green: '< ' + a + u, Amber: a + '–<' + r + u, Red: '≥ ' + r + u };
  } else if (k.Direction === 'Lower_Worse' && a !== null && r !== null) {
    auto = { Green: '> ' + a + u, Amber: '>' + r + '–' + a + u, Red: '≤ ' + r + u };
  }
  return {
    Green: str_(k.Green_Text) || auto.Green,
    Amber: str_(k.Amber_Text) || auto.Amber,
    Red: str_(k.Red_Text) || auto.Red
  };
}

// ============================ Normalize / validate ============================

function normalizeRisk_(input) {
  var r = {};
  RISK_INPUT_FIELDS.forEach(function (f) { r[f] = str_(input && input[f]); });
  ['Inherent_Impact', 'Inherent_Likelihood', 'Residual_Impact', 'Residual_Likelihood'].forEach(function (f) {
    r[f] = level_(r[f]) || '';
  });
  r.Mitigation_Due_Date = isoDate_(r.Mitigation_Due_Date);
  if (MITIGATION_STATUSES.indexOf(r.Mitigation_Status) < 0) r.Mitigation_Status = r.Mitigation_Plan ? 'Not Started' : '';
  var is = riskScore_(r.Inherent_Impact, r.Inherent_Likelihood);
  var rs = riskScore_(r.Residual_Impact, r.Residual_Likelihood);
  r.Inherent_Score = is || '';
  r.Inherent_Level = is ? riskLevel_(is).key : '';
  r.Residual_Score = rs || '';
  r.Residual_Level = rs ? riskLevel_(rs).key : '';
  return r;
}

function normalizeKri_(input) {
  var k = {};
  KRI_INPUT_FIELDS.forEach(function (f) { k[f] = str_(input && input[f]); });
  if (KRI_TYPES.indexOf(k.KRI_Type) < 0) k.KRI_Type = 'Leading';
  if (FREQUENCIES.indexOf(k.Frequency) < 0) k.Frequency = 'Monthly';
  if (DIRECTIONS.indexOf(k.Direction) < 0) k.Direction = 'Higher_Worse';
  k.Amber_Threshold = num_(k.Amber_Threshold) === null ? '' : num_(k.Amber_Threshold);
  k.Red_Threshold = num_(k.Red_Threshold) === null ? '' : num_(k.Red_Threshold);
  k.Owner_Email = k.Owner_Email.toLowerCase();
  k.Is_Active = input && input.Is_Active !== undefined && input.Is_Active !== '' ? bool_(input.Is_Active) : true;
  return k;
}

/** taxonomy: [{Risk_Type, Risk_Subtype}] — ว่าง = ไม่ตรวจคู่ Type/Sub-type */
function validateRisk_(r, kris, taxonomy, todayIso) {
  var errors = [], warnings = [];
  function req(f) { if (!str_(r[f])) errors.push('กรุณากรอก ' + FIELD_LABELS[f]); }
  ['Risk_Type', 'Risk_Subtype', 'Risk_Scenario', 'Risk_Cause', 'Consequences',
    'Inherent_Impact', 'Inherent_Impact_Rationale', 'Inherent_Likelihood', 'Inherent_Likelihood_Rationale',
    'Existing_Control',
    'Residual_Impact', 'Residual_Impact_Rationale', 'Residual_Likelihood', 'Residual_Likelihood_Rationale',
    'Risk_Owner'].forEach(req);
  if (taxonomy && taxonomy.length && r.Risk_Type && r.Risk_Subtype) {
    var ok = taxonomy.some(function (t) { return t.Risk_Type === r.Risk_Type && t.Risk_Subtype === r.Risk_Subtype; });
    if (!ok) errors.push('Risk Sub-type "' + r.Risk_Subtype + '" ไม่อยู่ใน Risk Type "' + r.Risk_Type + '" ตาม Taxonomy');
  }
  if (levelRank_(r.Residual_Level) >= levelRank_('High')) {
    if (!r.Mitigation_Plan) errors.push('ความเสี่ยงระดับ ' + r.Residual_Level + ' ต้องมี Mitigation plan');
    if (!r.Mitigation_Due_Date) errors.push('ความเสี่ยงระดับ ' + r.Residual_Level + ' ต้องระบุกำหนดเสร็จของแผน');
  }
  if (r.Mitigation_Plan && !r.Mitigation_Due_Date) warnings.push('ยังไม่ระบุกำหนดเสร็จของ Mitigation plan');
  if (r.Inherent_Score && r.Residual_Score && Number(r.Residual_Score) > Number(r.Inherent_Score)) {
    warnings.push('Residual risk สูงกว่า Inherent risk — ตรวจสอบระดับอีกครั้ง');
  }
  if (r.Mitigation_Due_Date && todayIso && r.Mitigation_Due_Date < todayIso && r.Mitigation_Status !== 'Done') {
    warnings.push('Mitigation plan เลยกำหนดแล้ว');
  }
  var active = (kris || []).filter(function (k) { return k.Is_Active !== false; });
  if (!active.length) warnings.push('ยังไม่มี KRI สำหรับติดตามความเสี่ยงนี้');
  else if (!active.some(function (k) { return k.KRI_Type === 'Leading'; })) warnings.push('ยังไม่มี Leading KRI (ตัวเตือนล่วงหน้า)');
  (kris || []).forEach(function (k, i) {
    var e = validateKri_(k);
    e.forEach(function (m) { errors.push('KRI ' + (k.KRI_Name || '#' + (i + 1)) + ': ' + m); });
  });
  return { errors: errors, warnings: warnings };
}

function validateKri_(k) {
  var e = [];
  if (!str_(k.KRI_Name)) e.push('กรุณากรอกชื่อ KRI');
  if (k.Direction !== 'Qualitative') {
    var a = num_(k.Amber_Threshold), r = num_(k.Red_Threshold);
    if (a === null || r === null) e.push('กรุณาใส่ค่า Amber และ Red (หรือเลือกแบบ Qualitative)');
    else if (k.Direction === 'Higher_Worse' && !(a < r)) e.push('ค่ามากยิ่งแย่: Amber ต้องน้อยกว่า Red');
    else if (k.Direction === 'Lower_Worse' && !(a > r)) e.push('ค่าน้อยยิ่งแย่: Amber ต้องมากกว่า Red');
  }
  if (k.Owner_Email && !/^[^@\s]+@[^@\s]+$/.test(k.Owner_Email)) e.push('อีเมลผู้รับผิดชอบไม่ถูกต้อง');
  return e;
}

// ============================ ID ============================

function nextSeqId_(prefix, ids) {
  var re = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)$');
  var max = 0;
  (ids || []).forEach(function (id) { var m = String(id).match(re); if (m) max = Math.max(max, Number(m[1])); });
  return max + 1;
}

function nextRiskId_(deptCode, ids) {
  return deptCode + '-R-' + ('00' + nextSeqId_(deptCode + '-R-', ids)).slice(-3);
}

function nextKriId_(riskId, ids) {
  return riskId + '-K' + nextSeqId_(riskId + '-K', ids);
}

/** รหัสแผนกจากชื่อ (ใช้ตอนนำเข้าข้อมูลเดิม) */
function deptCodeFromName_(name, existing) {
  var base = String(name || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'BU';
  var code = base, n = 2;
  while ((existing || []).indexOf(code) >= 0) code = base + (n++);
  return code;
}
