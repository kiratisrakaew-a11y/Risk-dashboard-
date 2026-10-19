/**
 * Export — สร้างไฟล์ Google Sheet ตามรูปแบบ RISK_REGISTER เดิม (สำหรับส่ง RMC / BOD)
 */

/** แปลง Risk + KRI → แถวคอลัมน์ A–AB ของ RISK_REGISTER เดิม (pure, มี unit test) */
function riskToLegacyRow_(r, kris, deptName) {
  var lvl = function (score, key) {
    var l = riskLevel_(num_(score));
    return l ? l.name + ' (' + score + ')' : (key || '');
  };
  var active = (kris || []).filter(function (k) { return isActive_(k.Is_Active); });
  var names = function (type) {
    return active.filter(function (k) { return k.KRI_Type === type; }).map(function (k) {
      return '• ' + k.KRI_Name + (k.Unit ? ' (' + k.Unit + ')' : '');
    }).join('\n');
  };
  var band = function (b) {
    return active.map(function (k) { var t = kriThresholdText_(k)[b]; return t ? '• ' + k.KRI_Name + ': ' + t : ''; }).filter(String).join('\n');
  };
  return [
    r.Risk_No, r.Assessment_Period, deptName || r.Business_Unit, r.Risk_ID, r.Risk_Type, r.Risk_Subtype,
    r.Risk_Scenario, r.Risk_Cause, r.Consequences,
    r.Inherent_Impact, r.Inherent_Impact_Rationale, r.Inherent_Likelihood, r.Inherent_Likelihood_Rationale,
    lvl(r.Inherent_Score, r.Inherent_Level),
    r.Existing_Control,
    r.Residual_Impact, r.Residual_Impact_Rationale, r.Residual_Likelihood, r.Residual_Likelihood_Rationale,
    lvl(r.Residual_Score, r.Residual_Level),
    r.Mitigation_Plan, isoDate_(r.Mitigation_Due_Date), r.Risk_Owner,
    names('Leading'), names('Lagging'), band('Green'), band('Amber'), band('Red')
  ].map(function (v) { return v === null || v === undefined ? '' : v; });
}

var LEGACY_HEADERS = ['Risk NO.', 'Assessment Period', 'Business unit', 'Risk ID', 'Risk Type', 'Risk Sub-type',
  'Risk Scenario', 'Risk cause', 'Consequences', 'Inherent Impact', 'Inherent Impact Rationale', 'Inherent Likelihood',
  'Inherent Likelihood rationale', 'Inherent risk Level', 'Existing control', 'Residual Impact', 'Residual Impact Rationale',
  'Residual Likelihood', 'Residual Likelihood rationale', 'Residual risk Level', 'Mitigation plan', 'Mitigation plan due date',
  'Risk Owner', 'Leading Key risk indicator', 'Lagging Key risk indicator', 'Green', 'Amber Status', 'Red Status'];

/** ข้อมูลสำหรับ export (dept ว่าง = ทุกแผนก) — ใช้ร่วมกันทั้ง Apps Script (Google Sheet) และ Cloud (.xlsx) */
function exportData_(dept, period, u) {
  var deptName = {};
  Db.readAll('Departments').forEach(function (d) { deptName[str_(d.Dept_Code).toUpperCase()] = str_(d.Dept_Name) || d.Dept_Code; });
  var risks = Db.readAll('Risks').filter(function (r) {
    var bu = str_(r.Business_Unit).toUpperCase();
    return (!dept || bu === dept) && canView_(u, bu) && str_(r.Assessment_Period) === period && r.Status !== 'Closed';
  }).sort(function (a, b) {
    return str_(a.Business_Unit) < str_(b.Business_Unit) ? -1 : str_(a.Business_Unit) > str_(b.Business_Unit) ? 1 : (num_(a.Risk_No) || 0) - (num_(b.Risk_No) || 0);
  });
  var krisByRisk = {};
  Db.readAll('KRIs').forEach(function (k) { (krisByRisk[k.Risk_ID] = krisByRisk[k.Risk_ID] || []).push(k); });
  var rows = risks.map(function (r) { return riskToLegacyRow_(r, krisByRisk[r.Risk_ID], deptName[str_(r.Business_Unit).toUpperCase()]); });
  var approval = null;
  if (dept) {
    var a = Db.readAll('Approvals').filter(function (x) { return str_(x.Dept_Code).toUpperCase() === dept && str_(x.Assessment_Period) === period; })[0];
    if (a) approval = {
      assessor: str_(a.Assessor), assessedAt: str_(a.Assessed_At).slice(0, 10),
      approver: str_(a.Approver) + (a.Status !== 'Approved' ? ' (' + a.Status + ')' : ''), approvedAt: str_(a.Approved_At).slice(0, 10)
    };
  }
  var name = 'Risk Register — ' + (dept ? deptName[dept] || dept : 'ทุกแผนก') + ' — ' + period + ' (' + isoDate_(new Date()) + ')';
  return { name: name, headers: LEGACY_HEADERS, rows: rows, approval: approval };
}

/** dept ว่าง = ทุกแผนก (ADMIN) */
function exportRegister_(dept, period, u) {
  var cfg = getConfig_();
  var data = exportData_(dept, period, u);
  var rows = data.rows, name = data.name;
  var out = SpreadsheetApp.create(name);
  var sheet = null;
  try {
    var tpl = SpreadsheetApp.openById(cfg.TEMPLATE_ID);
    ['RISK_REGISTER', 'Assesment/Review person', 'MATRIX', 'RISK TAXONOMY'].forEach(function (n) {
      var s = tpl.getSheetByName(n);
      if (s) s.copyTo(out).setName(n);
    });
    sheet = out.getSheetByName('RISK_REGISTER');
  } catch (e) { console.warn('เปิด template ไม่ได้ ใช้หัวตารางมาตรฐานแทน: ' + e.message); }
  if (!sheet) {
    sheet = out.insertSheet('RISK_REGISTER');
    sheet.getRange(1, 1, 1, LEGACY_HEADERS.length).setValues([LEGACY_HEADERS]).setFontWeight('bold');
  }
  out.getSheets().forEach(function (s) { if (s.getName() !== 'RISK_REGISTER' && /^(Sheet1|แผ่น1|แผ่นงาน1)$/.test(s.getName())) out.deleteSheet(s); });
  if (sheet.getMaxRows() > 1) sheet.getRange(2, 1, sheet.getMaxRows() - 1, LEGACY_HEADERS.length).clearContent();
  if (rows.length) {
    if (sheet.getMaxRows() < rows.length + 1) sheet.insertRowsAfter(sheet.getMaxRows(), rows.length + 1 - sheet.getMaxRows());
    sheet.getRange(2, 1, rows.length, LEGACY_HEADERS.length).setValues(rows.map(function (r) { return r.map(safeCell_); }));
  }
  // ผู้ประเมิน/ผู้อนุมัติ (เฉพาะ export รายแผนก)
  var ar = out.getSheetByName('Assesment/Review person');
  if (ar && data.approval) {
    ar.getRange('B1').setValue(data.approval.assessor);
    ar.getRange('D1').setValue(data.approval.assessedAt);
    ar.getRange('B2').setValue(data.approval.approver);
    ar.getRange('D2').setValue(data.approval.approvedAt);
  }
  out.setActiveSheet(sheet);
  try { DriveApp.getFileById(out.getId()).addEditor(u.email); } catch (e) { console.warn('แชร์ไฟล์ไม่ได้: ' + e.message); }
  Db.withLock(function () { Db.audit(u.email, 'EXPORT', 'Register', (dept || 'ALL') + '/' + period, null, { rows: rows.length, url: out.getUrl() }); });
  return { url: out.getUrl(), rows: rows.length, name: name };
}
