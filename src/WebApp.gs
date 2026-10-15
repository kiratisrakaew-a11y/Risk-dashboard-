/**
 * WebApp — doGet และ API ที่หน้าเว็บเรียกผ่าน google.script.run
 * ทุก API ตรวจสิทธิ์จากอีเมลผู้ใช้ฝั่ง server และกรองข้อมูลเฉพาะแผนกที่ผู้ใช้มีสิทธิ์
 * ผลลัพธ์ส่งกลับเป็น JSON string
 */

function doGet() {
  var user;
  try {
    user = requireUser_();
  } catch (e) {
    return HtmlService.createHtmlOutput(
      '<div style="font-family:sans-serif;padding:40px;text-align:center">' +
      '<h2>ไม่มีสิทธิ์เข้าใช้</h2><p>' + escHtml_(e.message) + '</p></div>').setTitle('Risk Register');
  }
  var t = HtmlService.createTemplateFromFile('ui/Index');
  t.userName = user.name;
  return t.evaluate()
    .setTitle('Risk Register & KRI')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include_(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function today_() { return isoDate_(new Date()); }

function activeDepts_() {
  return Db.readAll('Departments').filter(function (d) { return str_(d.Dept_Code) && isActive_(d.Is_Active); });
}

function deptCodesFor_(u, dept) {
  var visible = visibleDepts_(u, Db.readAll('Departments')).map(function (d) { return str_(d.Dept_Code).toUpperCase(); });
  if (!dept) return visible;
  dept = String(dept).toUpperCase();
  requireView_(u, dept);
  return [dept];
}

function findRisk_(riskId) {
  var r = Db.readAll('Risks').filter(function (x) { return x.Risk_ID === riskId; })[0];
  if (!r) throw new Error('ไม่พบ Risk ' + riskId);
  return r;
}

// ============================ เริ่มต้น ============================

function apiInit() {
  var u = requireUser_();
  var cfg = getConfig_();
  var depts = visibleDepts_(u, Db.readAll('Departments')).map(function (d) {
    var code = str_(d.Dept_Code).toUpperCase();
    return { code: code, name: str_(d.Dept_Name) || code, canEdit: canEdit_(u, code), canApprove: canApprove_(u, code) };
  });
  var periods = {};
  periods[cfg.ASSESSMENT_PERIOD] = true;
  Db.readAll('Risks').forEach(function (r) { if (r.Assessment_Period) periods[str_(r.Assessment_Period)] = true; });
  return JSON.stringify({
    user: { email: u.email, name: u.name, role: u.role, isAdmin: u.role === 'ADMIN' },
    depts: depts,
    taxonomy: Db.readAll('Taxonomy').map(function (t) {
      return { type: str_(t.Risk_Type), l2: str_(t.L2_Domain), subtype: str_(t.Risk_Subtype), desc: str_(t.Description_TH) };
    }).filter(function (t) { return t.type && t.subtype; }),
    scales: Db.readAll('Scale_Definitions').map(function (s) {
      return { dimension: s.Dimension, level: Number(s.Level), label: str_(s.Label), desc: str_(s.Description) };
    }),
    levels: RISK_LEVELS,
    lists: { kriTypes: KRI_TYPES, frequencies: FREQUENCIES, directions: DIRECTIONS, mitigationStatuses: MITIGATION_STATUSES, roles: ROLES },
    labels: FIELD_LABELS,
    cfg: { ASSESSMENT_PERIOD: cfg.ASSESSMENT_PERIOD, KRI_DUE_DAY: cfg.KRI_DUE_DAY, SCORE_THRESHOLD: cfg.SCORE_THRESHOLD,
      MITIGATION_WARN_DAYS: cfg.MITIGATION_WARN_DAYS, aiEnabled: !!PropertiesService.getScriptProperties().getProperty(API_KEY_PROPS[cfg.AI_PROVIDER]) },
    periods: Object.keys(periods).sort().reverse(),
    today: today_()
  });
}

// ============================ Dashboard ============================

function apiGetDashboard(dept, period) {
  var u = requireUser_();
  var cfg = getConfig_();
  var codes = deptCodesFor_(u, dept);
  var dash = computeDashboard_({
    risks: Db.readAll('Risks'), kris: Db.readAll('KRIs'), values: Db.readAll('KRI_Values'),
    depts: Db.readAll('Departments'), approvals: Db.readAll('Approvals'), aiReviews: Db.readAll('AI_Reviews')
  }, { deptCodes: codes, period: String(period || cfg.ASSESSMENT_PERIOD), today: today_(), cfg: cfg });
  return JSON.stringify(dash);
}

// ============================ Risk Register ============================

function apiListRisks(dept, period) {
  var u = requireUser_();
  var cfg = getConfig_();
  period = String(period || cfg.ASSESSMENT_PERIOD);
  var codes = {};
  deptCodesFor_(u, dept).forEach(function (c) { codes[c] = true; });
  var ai = {};
  Db.readAll('AI_Reviews').forEach(function (a) { ai[a.Risk_ID] = a; });
  var krisByRisk = {};
  Db.readAll('KRIs').forEach(function (k) { if (isActive_(k.Is_Active)) (krisByRisk[k.Risk_ID] = krisByRisk[k.Risk_ID] || []).push(k); });
  var valIdx = indexKriValues_(Db.readAll('KRI_Values'));
  var today = today_();
  var rows = Db.readAll('Risks').filter(function (r) {
    return codes[str_(r.Business_Unit).toUpperCase()] && str_(r.Assessment_Period) === period;
  }).map(function (r) {
    var kris = krisByRisk[r.Risk_ID] || [];
    var worst = '', rank = 0;
    kris.forEach(function (k) {
      var s = kriSnapshot_(k, valIdx, today, cfg);
      var st = s.status || s.lastStatus, rk = { Red: 3, Amber: 2, Green: 1 }[st] || 0;
      if (rk > rank) { rank = rk; worst = st; }
    });
    var a = ai[r.Risk_ID];
    var o = {};
    SHEETS.Risks.forEach(function (f) { o[f] = r[f]; });
    o.Business_Unit = str_(r.Business_Unit).toUpperCase();
    o.kriCount = kris.length;
    o.kriStatus = worst;
    o.aiScore = a ? num_(a.Score) : null;
    o.aiGrade = a ? a.Grade : '';
    o.canEdit = canEdit_(u, o.Business_Unit);
    return o;
  });
  return JSON.stringify(rows);
}

function apiGetRisk(riskId) {
  var u = requireUser_();
  var cfg = getConfig_();
  var r = findRisk_(String(riskId));
  var dept = str_(r.Business_Unit).toUpperCase();
  requireView_(u, dept);
  var kris = Db.readAll('KRIs').filter(function (k) { return k.Risk_ID === r.Risk_ID && isActive_(k.Is_Active); });
  var valIdx = indexKriValues_(Db.readAll('KRI_Values'));
  var a = Db.readAll('AI_Reviews').filter(function (x) { return x.Risk_ID === r.Risk_ID; })[0];
  var criteria = aiCriteria_('RISK', Db.readAll('AI_Criteria'));
  var review = null;
  if (a) {
    review = {
      score: num_(a.Score), grade: a.Grade, summary: a.Summary, model: a.Model, reviewedAt: a.Reviewed_At,
      criteria: JSON.parse(a.Criteria_JSON || '[]'), issues: JSON.parse(a.Issues_JSON || '[]'),
      improved: JSON.parse(a.Improved_JSON || '{}'),
      stale: a.Hash !== riskFingerprint_(r, kris, criteria), saved: true
    };
  }
  var risk = {};
  SHEETS.Risks.forEach(function (f) { risk[f] = r[f]; });
  return JSON.stringify({
    risk: risk,
    kris: kris.map(function (k) {
      var o = {};
      SHEETS.KRIs.forEach(function (f) { o[f] = k[f]; });
      o.snapshot = kriSnapshot_(k, valIdx, today_(), cfg);
      o.thresholds = kriThresholdText_(k);
      return o;
    }),
    review: review,
    canEdit: canEdit_(u, dept)
  });
}

/** payload = { dept, period, risk:{Risk_ID?, ...}, kris:[...] } */
function apiSaveRisk(payload) {
  var u = requireUser_();
  var cfg = getConfig_();
  payload = payload || {};
  var riskId = str_(payload.risk && payload.risk.Risk_ID);
  var dept = String(payload.dept || '').toUpperCase();
  return Db.withLock(function () {
    var existing = riskId ? findRisk_(riskId) : null;
    if (existing) dept = str_(existing.Business_Unit).toUpperCase(); // ห้ามย้ายแผนกผ่านหน้าเว็บ
    requireEdit_(u, dept);
    if (!activeDepts_().some(function (d) { return str_(d.Dept_Code).toUpperCase() === dept; })) throw new Error('ไม่พบแผนก ' + dept);
    var period = existing ? str_(existing.Assessment_Period) : String(payload.period || cfg.ASSESSMENT_PERIOD);
    var r = normalizeRisk_(payload.risk);
    var kris = (payload.kris || []).map(normalizeKri_);
    var v = validateRisk_(r, kris, Db.readAll('Taxonomy').map(function (t) { return { Risk_Type: str_(t.Risk_Type), Risk_Subtype: str_(t.Risk_Subtype) }; }), today_());
    if (v.errors.length) throw new Error('บันทึกไม่ได้:\n• ' + v.errors.join('\n• '));

    var now = Db.now();
    var row;
    if (existing) {
      row = JSON.parse(JSON.stringify(existing));
      Object.keys(r).forEach(function (f) { row[f] = r[f]; });
      row.Version = (Number(existing.Version) || 1) + 1;
      row.Updated_By = u.email; row.Updated_At = now;
      Db.update('Risks', existing._row, row);
      Db.audit(u.email, 'UPDATE', 'Risk', row.Risk_ID, existing, row);
    } else {
      var ids = Db.readAll('Risks').map(function (x) { return x.Risk_ID; });
      riskId = nextRiskId_(dept, ids);
      row = r;
      row.Risk_ID = riskId;
      row.Risk_No = nextSeqId_(dept + '-R-', ids);
      row.Assessment_Period = period;
      row.Business_Unit = dept;
      row.Status = 'Active';
      row.Version = 1;
      row.Created_By = u.email; row.Created_At = now; row.Updated_By = u.email; row.Updated_At = now;
      Db.append('Risks', [row]);
      Db.audit(u.email, 'CREATE', 'Risk', riskId, null, row);
    }

    // KRI: แก้ตาม KRI_ID, ใหม่ = สร้าง ID, ที่ถูกลบออกจากฟอร์ม = Is_Active FALSE (เก็บประวัติค่าไว้)
    var allKris = Db.readAll('KRIs');
    var mine = allKris.filter(function (k) { return k.Risk_ID === riskId; });
    var kept = {};
    var allIds = allKris.map(function (k) { return k.KRI_ID; });
    var toAppend = [];
    kris.forEach(function (k) {
      var hit = k.KRI_ID && mine.filter(function (m) { return m.KRI_ID === k.KRI_ID; })[0];
      if (hit) {
        var upd = JSON.parse(JSON.stringify(hit));
        KRI_INPUT_FIELDS.forEach(function (f) { if (f !== 'KRI_ID') upd[f] = k[f]; });
        upd.Is_Active = k.Is_Active === false ? 'FALSE' : 'TRUE';
        Db.update('KRIs', hit._row, upd);
        kept[hit.KRI_ID] = true;
      } else {
        k.KRI_ID = nextKriId_(riskId, allIds);
        allIds.push(k.KRI_ID);
        k.Risk_ID = riskId;
        k.Is_Active = 'TRUE';
        toAppend.push(k);
      }
    });
    Db.append('KRIs', toAppend);
    mine.forEach(function (m) {
      if (!kept[m.KRI_ID] && isActive_(m.Is_Active)) {
        var off = JSON.parse(JSON.stringify(m));
        off.Is_Active = 'FALSE';
        Db.update('KRIs', m._row, off);
      }
    });
    Db.audit(u.email, 'SAVE_KRIS', 'Risk', riskId, mine, kris);
    resetApprovalOnEdit_(dept, period, u.email);
    return JSON.stringify({ riskId: riskId, warnings: v.warnings });
  });
}

function apiSetRiskStatus(riskId, status) {
  var u = requireUser_();
  if (['Active', 'Closed'].indexOf(status) < 0) throw new Error('สถานะไม่ถูกต้อง');
  return Db.withLock(function () {
    var r = findRisk_(String(riskId));
    var dept = str_(r.Business_Unit).toUpperCase();
    requireEdit_(u, dept);
    var before = JSON.parse(JSON.stringify(r));
    r.Status = status; r.Updated_By = u.email; r.Updated_At = Db.now();
    Db.update('Risks', r._row, r);
    Db.audit(u.email, status === 'Closed' ? 'CLOSE' : 'REOPEN', 'Risk', r.Risk_ID, before, r);
    resetApprovalOnEdit_(dept, str_(r.Assessment_Period), u.email);
    return JSON.stringify({ ok: true });
  });
}

/** แก้ข้อมูลหลังส่งอนุมัติ/อนุมัติแล้ว → งวดนั้นกลับเป็น Draft ต้องส่งใหม่ */
function resetApprovalOnEdit_(dept, period, email) {
  var a = Db.readAll('Approvals').filter(function (x) {
    return str_(x.Dept_Code).toUpperCase() === dept && str_(x.Assessment_Period) === period;
  })[0];
  if (a && (a.Status === 'Submitted' || a.Status === 'Approved')) {
    var before = JSON.parse(JSON.stringify(a));
    a.Status = 'Draft';
    a.Note = 'มีการแก้ไขข้อมูลหลังส่ง/อนุมัติ โดย ' + email + ' เมื่อ ' + Db.now();
    Db.update('Approvals', a._row, a);
    Db.audit(email, 'RESET_APPROVAL', 'Approval', dept + '/' + period, before, a);
  }
}

// ============================ กรอกค่า KRI ============================

/** KRI ของแผนกสำหรับเดือนที่เลือก (รายไตรมาส = ไตรมาสของเดือนนั้น) */
function apiKriEntry(dept, month) {
  var u = requireUser_();
  var cfg = getConfig_();
  dept = String(dept || '').toUpperCase();
  requireView_(u, dept);
  var today = today_();
  month = /^\d{4}-\d{2}$/.test(String(month)) ? String(month) : reportingPeriod_('Monthly', today);
  var risks = {};
  Db.readAll('Risks').forEach(function (r) {
    if (str_(r.Business_Unit).toUpperCase() === dept && r.Status !== 'Closed' && str_(r.Assessment_Period) === cfg.ASSESSMENT_PERIOD) risks[r.Risk_ID] = r;
  });
  var valIdx = indexKriValues_(Db.readAll('KRI_Values'));
  var rows = Db.readAll('KRIs').filter(function (k) { return risks[k.Risk_ID] && isActive_(k.Is_Active); }).map(function (k) {
    var period = periodFor_(k.Frequency, month + '-01');
    var v = (valIdx[k.KRI_ID] || {})[period];
    var prev = (valIdx[k.KRI_ID] || {})[prevPeriod_(period)];
    var o = {};
    SHEETS.KRIs.forEach(function (f) { o[f] = k[f]; });
    o.riskScenario = risks[k.Risk_ID].Risk_Scenario;
    o.riskLevel = risks[k.Risk_ID].Residual_Level;
    o.period = period;
    o.due = periodDueDate_(period, cfg.KRI_DUE_DAY);
    o.thresholds = kriThresholdText_(k);
    o.value = v ? { Value: v.Value, Status: v.Status, Comment: v.Comment, Action_Taken: v.Action_Taken,
      Entered_By: v.Entered_By, Entered_At: v.Entered_At, AI_Result: v.AI_Result, AI_Feedback: v.AI_Feedback } : null;
    o.prev = prev ? { Value: prev.Value, Status: prev.Status } : null;
    return o;
  });
  return JSON.stringify({ dept: dept, month: month, canEdit: canEdit_(u, dept), rows: rows });
}

/** rows = [{KRI_ID, Period, Value, Status(สำหรับ Qualitative), Comment, Action_Taken}] */
function apiSaveKriValues(dept, rows) {
  var u = requireUser_();
  dept = String(dept || '').toUpperCase();
  requireEdit_(u, dept);
  var reds = [];
  var res = Db.withLock(function () {
    var riskDept = {};
    Db.readAll('Risks').forEach(function (r) { riskDept[r.Risk_ID] = str_(r.Business_Unit).toUpperCase(); });
    var kriById = {};
    Db.readAll('KRIs').forEach(function (k) { kriById[k.KRI_ID] = k; });
    var existing = Db.readAll('KRI_Values');
    var errors = [], saved = 0, toAppend = [];
    (rows || []).forEach(function (x) {
      var k = kriById[str_(x.KRI_ID)];
      if (!k || riskDept[k.Risk_ID] !== dept) { errors.push(str_(x.KRI_ID) + ': ไม่ใช่ KRI ของแผนกนี้'); return; }
      var period = str_(x.Period);
      if (!/^\d{4}-(\d{2}|Q[1-4])$/.test(period) || (k.Frequency === 'Quarterly') !== /Q/.test(period)) { errors.push(k.KRI_Name + ': งวดไม่ถูกต้อง'); return; }
      var value = str_(x.Value);
      if (value === '' && k.Direction !== 'Qualitative') { return; } // ไม่ได้กรอก = ข้าม
      if (k.Direction !== 'Qualitative' && num_(value) === null) { errors.push(k.KRI_Name + ': ค่าต้องเป็นตัวเลข'); return; }
      var status = kriStatus_(k, value, str_(x.Status));
      if (!status) { errors.push(k.KRI_Name + ': กรุณาเลือกสถานะ Green / Amber / Red'); return; }
      if ((status === 'Amber' || status === 'Red') && !str_(x.Comment)) { errors.push(k.KRI_Name + ': สถานะ ' + status + ' ต้องอธิบายสาเหตุ (Comment)'); return; }
      var row = { KRI_ID: k.KRI_ID, Period: period, Value: k.Direction === 'Qualitative' ? value : num_(value), Status: status,
        Comment: str_(x.Comment), Action_Taken: str_(x.Action_Taken), Entered_By: u.email, Entered_At: Db.now(), AI_Result: '', AI_Feedback: '' };
      var hit = existing.filter(function (e) { return e.KRI_ID === k.KRI_ID && str_(e.Period) === period; })[0];
      if (hit) {
        var same = str_(hit.Value) === str_(row.Value) && hit.Status === status && str_(hit.Comment) === row.Comment && str_(hit.Action_Taken) === row.Action_Taken;
        if (same) return;
        Db.update('KRI_Values', hit._row, row);
        Db.audit(u.email, 'UPDATE', 'KRI_Value', k.KRI_ID + '/' + period, hit, row);
        if (status === 'Red' && hit.Status !== 'Red') reds.push({ k: k, row: row });
      } else {
        toAppend.push(row);
        if (status === 'Red') reds.push({ k: k, row: row });
      }
      saved++;
    });
    Db.append('KRI_Values', toAppend);
    if (toAppend.length) Db.audit(u.email, 'CREATE', 'KRI_Value', dept, null, toAppend);
    return { saved: saved, errors: errors };
  });
  if (reds.length) notifyRedKris_(dept, reds);
  return JSON.stringify(res);
}

function apiKriHistory(kriId) {
  var u = requireUser_();
  var k = Db.readAll('KRIs').filter(function (x) { return x.KRI_ID === String(kriId); })[0];
  if (!k) throw new Error('ไม่พบ KRI');
  var r = findRisk_(k.Risk_ID);
  requireView_(u, str_(r.Business_Unit).toUpperCase());
  var vals = Db.readAll('KRI_Values').filter(function (v) { return v.KRI_ID === k.KRI_ID; })
    .sort(function (a, b) { return str_(a.Period) < str_(b.Period) ? -1 : 1; })
    .map(function (v) { return { period: v.Period, value: v.Value, status: v.Status, comment: v.Comment, action: v.Action_Taken,
      by: v.Entered_By, at: v.Entered_At, aiResult: v.AI_Result, aiFeedback: v.AI_Feedback }; });
  var o = {};
  SHEETS.KRIs.forEach(function (f) { o[f] = k[f]; });
  o.thresholds = kriThresholdText_(k);
  o.riskScenario = r.Risk_Scenario;
  return JSON.stringify({ kri: o, values: vals });
}

// ============================ AI ============================

function apiAiSuggest(req) {
  var u = requireUser_();
  return JSON.stringify(aiSuggest_(u, req || {}));
}

function apiAiReview(payload) {
  var u = requireUser_();
  payload = payload || {};
  if (payload.riskId) payload.dept = str_(findRisk_(String(payload.riskId)).Business_Unit).toUpperCase();
  return JSON.stringify(aiReviewRisk_(u, payload));
}

/** ตรวจคำอธิบายค่า KRI ของงวดที่บันทึกแล้ว */
function apiAiReviewKri(kriId, period) {
  var u = requireUser_();
  var k = Db.readAll('KRIs').filter(function (x) { return x.KRI_ID === String(kriId); })[0];
  if (!k) throw new Error('ไม่พบ KRI');
  var r = findRisk_(k.Risk_ID);
  requireView_(u, str_(r.Business_Unit).toUpperCase());
  var v = Db.readAll('KRI_Values').filter(function (x) { return x.KRI_ID === k.KRI_ID && str_(x.Period) === String(period); })[0];
  if (!v) throw new Error('ยังไม่ได้บันทึกค่า KRI ของงวดนี้');
  checkAiQuota_(u);
  var out = reviewKriComment_(k, v, r, aiCriteria_('KRI_COMMENT', Db.readAll('AI_Criteria')));
  Db.withLock(function () {
    var cur = Db.readAll('KRI_Values').filter(function (x) { return x.KRI_ID === k.KRI_ID && str_(x.Period) === String(period); })[0];
    cur.AI_Result = out.grade + ' · ' + out.score;
    cur.AI_Feedback = out.feedback;
    Db.update('KRI_Values', cur._row, cur);
  });
  return JSON.stringify(out);
}

function apiAiOverview(dept, period) {
  var u = requireUser_();
  var cfg = getConfig_();
  period = String(period || cfg.ASSESSMENT_PERIOD);
  var codes = {};
  deptCodesFor_(u, dept).forEach(function (c) { codes[c] = true; });
  var risks = Db.readAll('Risks').filter(function (r) {
    return codes[str_(r.Business_Unit).toUpperCase()] && str_(r.Assessment_Period) === period && r.Status !== 'Closed';
  });
  var criteria = aiCriteria_('RISK', Db.readAll('AI_Criteria'));
  var krisByRisk = {};
  Db.readAll('KRIs').forEach(function (k) { (krisByRisk[k.Risk_ID] = krisByRisk[k.Risk_ID] || []).push(k); });
  var ai = {};
  Db.readAll('AI_Reviews').forEach(function (a) { ai[a.Risk_ID] = a; });
  var critStat = {};
  criteria.forEach(function (c) { critStat[c] = { name: c, yes: 0, partial: 0, no: 0 }; });
  var rows = risks.map(function (r) {
    var a = ai[r.Risk_ID];
    if (a) {
      JSON.parse(a.Criteria_JSON || '[]').forEach(function (c) { if (critStat[c.name]) critStat[c.name][c.result]++; });
    }
    return { Risk_ID: r.Risk_ID, dept: str_(r.Business_Unit).toUpperCase(), scenario: r.Risk_Scenario, level: r.Residual_Level,
      score: a ? num_(a.Score) : null, grade: a ? a.Grade : '', summary: a ? a.Summary : '', reviewedAt: a ? a.Reviewed_At : '',
      stale: a ? a.Hash !== riskFingerprint_(r, krisByRisk[r.Risk_ID], criteria) : false };
  });
  var runs = [];
  if (u.role === 'ADMIN') runs = Db.readAll('AI_Runs').slice(-10).reverse();
  return JSON.stringify({ rows: rows, criteria: Object.keys(critStat).map(function (k) { return critStat[k]; }), runs: runs,
    threshold: cfg.SCORE_THRESHOLD, provider: cfg.AI_PROVIDER, model: cfg.AI_MODEL });
}

function apiRunAiBatch() {
  requireAdmin_();
  return JSON.stringify(runAiBatch());
}

// ============================ อนุมัติ ============================

function apiApprovals(period) {
  var u = requireUser_();
  var cfg = getConfig_();
  period = String(period || cfg.ASSESSMENT_PERIOD);
  var depts = visibleDepts_(u, Db.readAll('Departments'));
  var dash = computeDashboard_({
    risks: Db.readAll('Risks'), kris: Db.readAll('KRIs'), values: Db.readAll('KRI_Values'),
    depts: Db.readAll('Departments'), approvals: Db.readAll('Approvals'), aiReviews: Db.readAll('AI_Reviews')
  }, { deptCodes: depts.map(function (d) { return str_(d.Dept_Code).toUpperCase(); }), period: period, today: today_(), cfg: cfg });
  var ap = {};
  Db.readAll('Approvals').forEach(function (a) { if (str_(a.Assessment_Period) === period) ap[str_(a.Dept_Code).toUpperCase()] = a; });
  var rows = depts.map(function (d) {
    var code = str_(d.Dept_Code).toUpperCase();
    var a = ap[code] || {};
    var sum = dash.byDept.filter(function (x) { return x.code === code; })[0] || {};
    return { code: code, name: str_(d.Dept_Name) || code, approverEmail: str_(d.Approver_Email),
      status: a.Status || 'Draft', assessor: a.Assessor || '', assessedAt: a.Assessed_At || '', approver: a.Approver || '',
      approvedAt: a.Approved_At || '', note: a.Note || '', summary: sum,
      canSubmit: canEdit_(u, code), canApprove: canApprove_(u, code) };
  });
  return JSON.stringify({ period: period, rows: rows });
}

function apiApprovalAction(dept, period, action, note) {
  var u = requireUser_();
  dept = String(dept || '').toUpperCase();
  period = String(period || getConfig_().ASSESSMENT_PERIOD);
  var d = Db.readAll('Departments').filter(function (x) { return str_(x.Dept_Code).toUpperCase() === dept; })[0];
  if (!d) throw new Error('ไม่พบแผนก');
  var result = Db.withLock(function () {
    var a = Db.readAll('Approvals').filter(function (x) { return str_(x.Dept_Code).toUpperCase() === dept && str_(x.Assessment_Period) === period; })[0];
    var before = a ? JSON.parse(JSON.stringify(a)) : null;
    var row = a || { Dept_Code: dept, Assessment_Period: period, Status: 'Draft' };
    if (action === 'submit') {
      requireEdit_(u, dept);
      var n = Db.readAll('Risks').filter(function (r) { return str_(r.Business_Unit).toUpperCase() === dept && str_(r.Assessment_Period) === period && r.Status !== 'Closed'; }).length;
      if (!n) throw new Error('ยังไม่มีความเสี่ยงในงวดนี้');
      if (row.Status === 'Approved') throw new Error('งวดนี้อนุมัติแล้ว');
      row.Status = 'Submitted'; row.Assessor = u.email; row.Assessed_At = Db.now(); row.Approver = ''; row.Approved_At = '';
    } else if (action === 'approve' || action === 'return') {
      if (!canApprove_(u, dept)) throw new Error('ไม่มีสิทธิ์อนุมัติแผนก ' + dept);
      if (row.Status !== 'Submitted') throw new Error('งวดนี้ยังไม่ได้ส่งอนุมัติ');
      row.Status = action === 'approve' ? 'Approved' : 'Returned';
      row.Approver = u.email; row.Approved_At = Db.now();
    } else throw new Error('action ไม่ถูกต้อง');
    row.Note = str_(note);
    if (a) Db.update('Approvals', a._row, row); else Db.append('Approvals', [row]);
    Db.audit(u.email, action.toUpperCase(), 'Approval', dept + '/' + period, before, row);
    return row;
  });
  notifyApproval_(d, period, action, u, note, result);
  return JSON.stringify(result);
}

// ============================ ADMIN ============================

function apiAdminData() {
  requireAdmin_();
  var cfg = getConfig_();
  var props = PropertiesService.getScriptProperties();
  var keys = {};
  Object.keys(API_KEY_PROPS).forEach(function (p) { keys[p] = !!props.getProperty(API_KEY_PROPS[p]); });
  var crit = Db.readAll('AI_Criteria');
  function strip(rows, fields) { return rows.map(function (r) { var o = {}; fields.forEach(function (f) { o[f] = r[f]; }); return o; }); }
  var settings = {};
  EDITABLE_SETTINGS.forEach(function (k) { settings[k] = cfg[k]; });
  return JSON.stringify({
    users: strip(Db.readAll('Users'), SHEETS.Users),
    depts: strip(Db.readAll('Departments'), SHEETS.Departments),
    settings: settings, keys: keys, defaultModels: DEFAULT_MODELS,
    criteria: { RISK: aiCriteria_('RISK', crit).join('\n'), KRI_COMMENT: aiCriteria_('KRI_COMMENT', crit).join('\n') },
    dbUrl: Db.url()
  });
}

function apiSaveUser(obj, originalEmail) {
  var u = requireAdmin_();
  var email = str_(obj && obj.Email).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) throw new Error('อีเมลไม่ถูกต้อง');
  var role = str_(obj.Role).toUpperCase();
  if (ROLES.indexOf(role) < 0) throw new Error('Role ไม่ถูกต้อง');
  var row = { Email: email, Name: str_(obj.Name), Role: role,
    Departments: splitList_(obj.Departments).map(function (d) { return d.toUpperCase(); }).join(', '),
    Is_Active: isActive_(obj.Is_Active) ? 'TRUE' : 'FALSE', Note: str_(obj.Note) };
  Db.withLock(function () {
    var key = str_(originalEmail || email).toLowerCase();
    var hit = Db.readAll('Users').filter(function (x) { return str_(x.Email).toLowerCase() === key; })[0];
    if (!hit && Db.readAll('Users').some(function (x) { return str_(x.Email).toLowerCase() === email; })) throw new Error('มีผู้ใช้อีเมลนี้แล้ว');
    if (hit) Db.update('Users', hit._row, row); else Db.append('Users', [row]);
    Db.audit(u.email, hit ? 'UPDATE' : 'CREATE', 'User', email, hit || null, row);
  });
  return apiAdminData();
}

function apiSaveDept(obj, originalCode) {
  var u = requireAdmin_();
  var code = str_(obj && obj.Dept_Code).toUpperCase();
  if (!/^[A-Z0-9_]{2,12}$/.test(code)) throw new Error('รหัสแผนกใช้ A-Z, 0-9, _ ยาว 2-12 ตัว');
  var row = { Dept_Code: code, Dept_Name: str_(obj.Dept_Name), Approver_Email: str_(obj.Approver_Email).toLowerCase(),
    Is_Active: isActive_(obj.Is_Active) ? 'TRUE' : 'FALSE' };
  Db.withLock(function () {
    var key = str_(originalCode || code).toUpperCase();
    var hit = Db.readAll('Departments').filter(function (x) { return str_(x.Dept_Code).toUpperCase() === key; })[0];
    if (hit && key !== code) throw new Error('เปลี่ยนรหัสแผนกไม่ได้ (Risk ID อ้างอิงรหัสนี้อยู่) — ให้ปิดแผนกเดิมแล้วสร้างใหม่');
    if (!hit && Db.readAll('Departments').some(function (x) { return str_(x.Dept_Code).toUpperCase() === code; })) throw new Error('มีรหัสแผนกนี้แล้ว');
    if (hit) Db.update('Departments', hit._row, row); else Db.append('Departments', [row]);
    Db.audit(u.email, hit ? 'UPDATE' : 'CREATE', 'Department', code, hit || null, row);
  });
  return apiAdminData();
}

function apiSaveSettings(obj) {
  var u = requireAdmin_();
  var clean = {};
  EDITABLE_SETTINGS.forEach(function (k) { if (obj && obj[k] !== undefined) clean[k] = str_(obj[k]); });
  if (clean.AI_PROVIDER && !API_KEY_PROPS[clean.AI_PROVIDER]) throw new Error('provider ไม่ถูกต้อง');
  NUMERIC_SETTINGS.forEach(function (k) { if (clean[k] !== undefined && clean[k] !== '' && isNaN(Number(clean[k]))) throw new Error(k + ' ต้องเป็นตัวเลข'); });
  Db.withLock(function () { Db.writeSettings(clean); Db.audit(u.email, 'UPDATE', 'Settings', '', null, clean); });
  return apiAdminData();
}

function apiSaveCriteria(scope, text) {
  var u = requireAdmin_();
  scope = String(scope).toUpperCase();
  if (!AI_DEFAULT_CRITERIA[scope]) throw new Error('scope ไม่ถูกต้อง');
  Db.withLock(function () {
    var rows = Db.readAll('AI_Criteria').filter(function (r) { return str_(r.Scope).toUpperCase() === scope; });
    var row = { Scope: scope, Criteria: str_(text), Is_Active: str_(text) ? 'TRUE' : 'FALSE', Note: 'แก้โดย ' + u.email + ' ' + Db.now() };
    if (rows[0]) Db.update('AI_Criteria', rows[0]._row, row); else Db.append('AI_Criteria', [row]);
    rows.slice(1).forEach(function (r) { r.Is_Active = 'FALSE'; Db.update('AI_Criteria', r._row, r); });
    Db.audit(u.email, 'UPDATE', 'AI_Criteria', scope, rows[0] || null, row);
  });
  return apiAdminData();
}

function apiImportLegacy(urlOrId, period) {
  var u = requireAdmin_();
  var id = String(urlOrId || '').match(/[-\w]{25,}/);
  if (!id) throw new Error('ลิงก์ Google Sheet ไม่ถูกต้อง');
  return JSON.stringify(importLegacyRegister_(id[0], String(period || getConfig_().ASSESSMENT_PERIOD), u.email));
}

function apiExport(dept, period) {
  var u = requireUser_();
  dept = String(dept || '').toUpperCase();
  if (dept) requireView_(u, dept); else requireAdmin_();
  return JSON.stringify(exportRegister_(dept, String(period || getConfig_().ASSESSMENT_PERIOD), u));
}
