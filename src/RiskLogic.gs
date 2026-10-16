/**
 * RiskLogic — กติกาคำนวณ/ตรวจข้อมูล (pure function มี unit test)
 */

// ============================ Risk score / level ============================

function riskScore_(impact, likelihood) {
  var i = level_(impact), l = level_(likelihood);
  return i && l ? i * l : null;
}

/** ระดับความเสี่ยงตามเกณฑ์บริษัท: Low 1–6 / Medium 7–11 / High 12–19 / Very High 20–25 */
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
  if (ASSESS_MODES.indexOf(r.Assess_Mode) < 0) r.Assess_Mode = 'New Risk';
  if (REVIEW_WINDOWS.indexOf(r.Review_Window) < 0) r.Review_Window = '';
  r.Incident_Count = num_(r.Incident_Count) === null || num_(r.Incident_Count) < 0 ? '' : Math.round(num_(r.Incident_Count));
  r.Impact_Dimensions = IMPACT_DIMENSIONS.filter(function (d) { return splitList_(r.Impact_Dimensions).indexOf(d) >= 0; }).join(', ');
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

/** คีย์เทียบ Risk Type: ไม่สนตัวพิมพ์เล็ก/ใหญ่ ช่องว่างซ้ำ และช่องว่างรอบ "/" ("Operational Risk" = "Operational risk") */
function typeKey_(s) {
  return str_(s).toLowerCase().replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ');
}

/** key → ชื่อมาตรฐานของ Risk Type จาก Taxonomy: ใช้ตัวสะกดที่มีหลายแถวที่สุด เสมอกันให้ลงท้าย " risk" (ตัวเล็ก) ตามแบบ ESG risk */
function typeCanon_(taxonomy) {
  var count = {};
  (taxonomy || []).forEach(function (t) {
    var name = str_(t.Risk_Type !== undefined ? t.Risk_Type : t.type);
    if (!name) return;
    var k = typeKey_(name);
    count[k] = count[k] || {};
    count[k][name] = (count[k][name] || 0) + 1;
  });
  var canon = {};
  Object.keys(count).forEach(function (k) {
    canon[k] = Object.keys(count[k]).sort(function (a, b) {
      return (count[k][b] - count[k][a]) || (/ risk$/.test(b) - / risk$/.test(a)) || (a < b ? -1 : a > b ? 1 : 0);
    })[0];
  });
  return canon;
}

/** แปลงเป็นชื่อมาตรฐาน (ไม่พบใน Taxonomy = คืนค่าเดิม) */
function canonType_(s, canon) {
  var v = str_(s);
  return (v && canon && canon[typeKey_(v)]) || v;
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
    var ok = taxonomy.some(function (t) { return typeKey_(t.Risk_Type) === typeKey_(r.Risk_Type) && str_(t.Risk_Subtype) === str_(r.Risk_Subtype); });
    if (!ok) errors.push('Risk Sub-type "' + r.Risk_Subtype + '" ไม่อยู่ใน Risk Type "' + r.Risk_Type + '" ตาม Taxonomy');
  }
  if (levelRank_(r.Residual_Level) >= levelRank_('High')) {
    if (!r.Mitigation_Plan) errors.push('ความเสี่ยงระดับ ' + r.Residual_Level + ' ต้องมี Mitigation plan');
    if (!r.Mitigation_Due_Date) errors.push('ความเสี่ยงระดับ ' + r.Residual_Level + ' ต้องระบุกำหนดเสร็จของแผน');
  }
  if (r.Mitigation_Plan && !r.Mitigation_Due_Date) warnings.push('ยังไม่ระบุกำหนดเสร็จของ Mitigation plan');
  var ctl = parseControls_(r.Existing_Control);
  if (r.Existing_Control && !(ctl.Preventive || ctl.Detective || ctl.Corrective)) {
    warnings.push('Exiting control ควรแยกเป็น Preventive / Detective / Corrective พร้อมระบุใครทำ ความถี่ และหลักฐาน');
  }
  if (r.Assess_Mode === 'Reassessment') {
    var miss = missingIntake_(r, 'residual');
    if (miss.length) warnings.push('Reassessment ยังขาดข้อมูลประกอบคะแนน: ' + miss.map(function (m) { return m.label; }).join(', '));
  }
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

// ============================ Exiting control (P/D/C) ============================

var CONTROL_TYPES = ['Preventive', 'Detective', 'Corrective'];

/** แยกข้อความ control ที่เขียนเป็น "Preventive: …\nDetective: …\nCorrective: …" — ข้อความที่ไม่อยู่ใต้หัวข้อเก็บไว้ใน Other */
function parseControls_(text) {
  var out = { Preventive: '', Detective: '', Corrective: '', Other: '' };
  var cur = 'Other';
  String(text || '').split(/\r?\n/).forEach(function (line) {
    var m = line.match(/^\s*(?:[-•*]\s*)?(Preventive|Detective|Corrective|ป้องกัน|ตรวจจับ|แก้ไข)\s*(?:\([^)]*\))?\s*[:：]\s*(.*)$/i);
    if (m) {
      var k = m[1].toLowerCase();
      cur = k === 'ป้องกัน' ? 'Preventive' : k === 'ตรวจจับ' ? 'Detective' : k === 'แก้ไข' ? 'Corrective' : k.charAt(0).toUpperCase() + k.slice(1);
      line = m[2];
    }
    out[cur] = out[cur] ? out[cur] + '\n' + line : line;
  });
  Object.keys(out).forEach(function (k) { out[k] = out[k].trim(); });
  return out;
}

function joinControls_(c) {
  var lines = [];
  if (c && str_(c.Other)) lines.push(str_(c.Other));
  CONTROL_TYPES.forEach(function (k) { if (c && str_(c[k])) lines.push(k + ': ' + str_(c[k])); });
  return lines.join('\n');
}

// ============================ ข้อมูลขั้นต่ำก่อนให้คะแนน ============================

/**
 * ข้อมูลที่ยังขาดก่อนให้ AI แนะนำคะแนน (กันการเดา) — แยกตามขั้นการประเมิน
 * stage = 'inherent' : เหตุการณ์ / ผลกระทบ (มิติ) / ความถี่-ข้อมูลการเกิด  (ไม่ต้องมี control เพราะประเมินแบบไม่มี control)
 * stage = 'residual' : ต้องมีคะแนน Inherent ก่อน + control ที่ทำจริงแยก P/D/C
 *                      Reassessment เพิ่ม R3 ช่วงเวลา, R4 เหตุการณ์จริง + ตัวอย่าง, R5 มิติที่กระทบจริง
 */
function missingIntake_(r, stage) {
  var miss = [];
  function need(field, label, question) { miss.push({ field: field, label: label, question: question }); }
  var ctl = parseControls_(r.Existing_Control);
  var reassess = r.Assess_Mode === 'Reassessment';
  if (!str_(r.Risk_Scenario)) need('Risk_Scenario', 'เหตุการณ์ความเสี่ยง', 'เหตุการณ์ความเสี่ยงคืออะไร (อะไรอาจเกิดขึ้น กับอะไร/ใคร)?');
  if (stage === 'residual') {
    if (!level_(r.Inherent_Impact) || !level_(r.Inherent_Likelihood)) {
      need('Inherent_Impact', 'คะแนน Inherent', 'ยังไม่มีคะแนน Inherent — ต้องประเมิน Inherent (ก่อนมีมาตรการควบคุม) ก่อน แล้วจึงประเมิน Residual');
    }
    if (!(ctl.Preventive || ctl.Detective || ctl.Corrective)) {
      need('Existing_Control', 'Exiting control ที่ทำจริง แยก P/D/C' + (reassess ? ' (R6)' : ''), 'ปัจจุบันมีมาตรการควบคุมอะไรที่ทำจริง แยกเป็น Preventive / Detective / Corrective — ใครทำ ทำถี่แค่ไหน มีหลักฐานอะไร (checklist, log, report, ticket, approval record)? ถ้ายังไม่มี control เลย Residual จะเท่ากับ Inherent');
    }
    if (reassess) {
      if (!str_(r.Review_Window)) need('Review_Window', 'ช่วงเวลาที่ทบทวน (R3)', 'ทบทวนข้อมูลช่วงใด: ไตรมาสล่าสุด / 6 เดือน / 1 ปี?');
      if (num_(r.Incident_Count) === null) need('Incident_Count', 'จำนวนเหตุการณ์จริง/near miss (R4)', 'ในช่วงเวลาดังกล่าวเกิดเหตุการณ์จริงหรือ near miss กี่ครั้ง?');
      else if (num_(r.Incident_Count) > 0 && !str_(r.Incident_Examples)) need('Incident_Examples', 'ตัวอย่างเหตุการณ์ (R4)', 'ยกตัวอย่างเหตุการณ์ 1–2 เคส (เกิดอะไร เมื่อไร เสียหายเท่าไร)');
      if (!str_(r.Impact_Dimensions)) need('Impact_Dimensions', 'มิติที่กระทบจริง (R5)', 'ผลกระทบจริงที่เกิดอยู่ในมิติใด (Financial / Legal & Compliance / Reputation / Operations / ESG) อย่างน้อย 1–2 มิติ?');
    }
    return miss;
  }
  if (!str_(r.Consequences) && !str_(r.Impact_Dimensions)) need('Consequences', 'ผลกระทบ', 'ถ้าเกิดเหตุการณ์นี้ จะกระทบอะไรบ้าง และกระทบมิติใด (การเงิน ประมาณกี่บาท/กี่ % ของกำไร, กฎหมาย, ชื่อเสียง, การปฏิบัติงาน, ESG)?');
  if (num_(r.Incident_Count) === null && !str_(r.Incident_Examples)) need('Incident_Examples', 'ความถี่/ข้อมูลการเกิด', 'ที่ผ่านมาเคยเกิดขึ้นบ่อยแค่ไหน (กี่ครั้งต่อปี) หรือมีข้อมูลอะไรบอกโอกาสเกิด หากไม่มีมาตรการควบคุม?');
  return miss;
}
