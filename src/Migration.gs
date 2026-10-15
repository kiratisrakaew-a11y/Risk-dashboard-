/**
 * Migration — setup() สร้างไฟล์ DB และนำเข้าข้อมูลจาก Sheet เดิม (RISK_REGISTER_TEMPLATE)
 */

var SETTING_DESCRIPTIONS = {
  ASSESSMENT_PERIOD: 'งวดประเมินปัจจุบัน เช่น 2026 หรือ 2026-H2 (ว่าง = ปีปัจจุบัน)',
  KRI_DUE_DAY: 'ค่า KRI ของงวดที่ปิดแล้วต้องกรอกภายในวันที่เท่าไหร่ของเดือนถัดไป',
  REMINDER_DAYS: 'วันที่ของเดือนที่ส่งอีเมลเตือน KRI ค้างกรอก คั่นด้วย ,',
  MITIGATION_WARN_DAYS: 'แผนลดความเสี่ยงที่ครบกำหนดภายในกี่วัน = ใกล้ครบกำหนด',
  AI_PROVIDER: 'gemini | claude | openai (API key ตั้งใน Script Properties)',
  AI_MODEL: 'ว่าง = ใช้รุ่นตั้งต้นของ provider',
  AI_EFFORT: 'low | medium | high (Claude = effort, Gemini 3 = thinking level: low = เร็ว, อื่นๆ = high)',
  AI_DAILY_LIMIT: 'จำนวนครั้งที่ผู้ใช้ 1 คนเรียก AI ได้ต่อวัน',
  AI_BATCH_SIZE: 'จำนวนรายการที่ AI ตรวจต่อรอบอัตโนมัติ (ทุกชั่วโมง)',
  SCORE_THRESHOLD: 'คะแนน AI ต่ำกว่านี้ = ควรปรับปรุง'
};

/** รันครั้งแรกจาก editor: สร้าง/ซ่อมแซมไฟล์ DB, ใส่ข้อมูลตั้งต้น และติดตั้ง trigger (รันซ้ำได้) */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var me = currentEmail_();
  var id = props.getProperty('DB_ID');
  var ss;
  if (id) ss = SpreadsheetApp.openById(id);
  else {
    ss = SpreadsheetApp.create('Risk Register — DB');
    props.setProperty('DB_ID', ss.getId());
  }
  Object.keys(SHEETS).forEach(function (name) { ensureSheet_(ss, name, SHEETS[name]); });
  ['Sheet1', 'แผ่น1', 'แผ่นงาน1'].forEach(function (n) {
    var sh = ss.getSheetByName(n);
    if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
  Db.clearMemo();
  resetConfigMemo_();

  if (!Db.readAll('Settings').length) {
    Db.append('Settings', EDITABLE_SETTINGS.map(function (k) {
      return { Key: k, Value: k === 'AI_MODEL' ? '' : DEFAULTS[k], Description: SETTING_DESCRIPTIONS[k] || '' };
    }));
  }
  if (!Db.readAll('Users').length && me) {
    Db.append('Users', [{ Email: me, Name: me.split('@')[0], Role: 'ADMIN', Departments: '*', Is_Active: 'TRUE', Note: 'สร้างโดย setup()' }]);
  }
  // หน่วยงาน: เพิ่มรายการตามเกณฑ์บริษัทที่ยังไม่มี และปิดรหัสรุ่นก่อนที่ยังไม่มี Risk
  var sync = planDeptSync_(Db.readAll('Departments'), Db.readAll('Risks'));
  Db.append('Departments', sync.add.map(function (d) { return { Dept_Code: d[0], Dept_Name: d[1], Approver_Email: '', Is_Active: 'TRUE', Description: '' }; }));
  sync.retire.forEach(function (row) { row.Is_Active = 'FALSE'; Db.update('Departments', row._row, row); });
  if (sync.add.length || sync.retire.length) console.log('หน่วยงาน: เพิ่ม ' + sync.add.length + ' / ปิด ' + sync.retire.length);
  // นิยามระดับ: ใส่เกณฑ์บริษัทถ้ายังว่าง หรือยังเป็นข้อความทั่วไปของรุ่นแรก (ถ้า ADMIN แก้เองแล้วจะไม่ทับ)
  var scales = Db.readAll('Scale_Definitions');
  if (!scales.length || isOldScaleSeed_(scales)) {
    var sh = Db.sheet('Scale_Definitions');
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
    Db.clearMemo();
    Db.append('Scale_Definitions', scaleSeed_().map(function (r) { return { Dimension: r[0], Level: r[1], Sub_Dimension: r[2], Label: r[3], Description: r[4] }; }));
    console.log('ใส่นิยามระดับตามเกณฑ์ Risk Impact & Likelihood ของบริษัทแล้ว');
  }
  var crit = Db.readAll('AI_Criteria');
  if (!crit.length) {
    Db.append('AI_Criteria', Object.keys(AI_DEFAULT_CRITERIA).map(function (k) {
      return { Scope: k, Criteria: AI_DEFAULT_CRITERIA[k].join('\n'), Is_Active: 'TRUE', Note: '1 เกณฑ์ต่อบรรทัด — แก้ได้ในหน้า ตั้งค่า' };
    }));
  } else {
    crit.forEach(function (r) {
      if (str_(r.Scope).toUpperCase() === 'RISK' && String(r.Criteria || '').indexOf(OLD_RISK_CRITERIA_FIRST_LINE) === 0) {
        r.Criteria = AI_DEFAULT_CRITERIA.RISK.join('\n');
        r.Note = 'อัปเดตเป็นเกณฑ์ตาม instruction ของบริษัทโดย setup()';
        Db.update('AI_Criteria', r._row, r);
      }
    });
  }
  var cfg = getConfig_();
  if (!Db.readAll('Taxonomy').length) {
    try {
      var n = importTaxonomy_(cfg.TEMPLATE_ID);
      console.log('นำเข้า Taxonomy ' + n + ' รายการ');
    } catch (e) { console.warn('นำเข้า Taxonomy ไม่ได้: ' + e.message); }
  }
  try { copyReferenceSheets_(ss, cfg.TEMPLATE_ID); } catch (e) { console.warn('คัดลอกชีตอ้างอิงไม่ได้: ' + e.message); }
  installTriggers_();
  console.log('DB: ' + ss.getUrl());
  console.log('ขั้นต่อไป: ตรวจรายชื่อแผนกในชีต Departments (23 หน่วยงาน) เติมคำอธิบายหน้าที่ (Description) และอีเมลผู้อนุมัติ / เพิ่มผู้ใช้ในชีต Users (หรือในหน้า ตั้งค่า ของ Web App) แล้ว Deploy เป็น Web app');
}

/** แผนปรับรายชื่อหน่วยงาน (pure): add = [code, name] ที่ยังไม่มี, retire = แถวรหัสรุ่นก่อนที่ยัง active และยังไม่มี Risk */
function planDeptSync_(deptRows, riskRows) {
  var have = {}, used = {};
  (deptRows || []).forEach(function (d) { have[str_(d.Dept_Code).toUpperCase()] = true; });
  (riskRows || []).forEach(function (r) { used[str_(r.Business_Unit).toUpperCase()] = true; });
  return {
    add: DEPARTMENT_SEED.filter(function (d) { return !have[d[0]]; }),
    retire: (deptRows || []).filter(function (d) {
      var c = str_(d.Dept_Code).toUpperCase();
      return RETIRED_DEPT_CODES.indexOf(c) >= 0 && isActive_(d.Is_Active) && !used[c];
    })
  };
}

/** นิยามระดับยังเป็นข้อความทั่วไปของรุ่นแรกทุกแถว (ยังไม่ได้แก้เอง) */
function isOldScaleSeed_(rows) {
  return rows.length > 0 && rows.every(function (r) {
    return OLD_SCALE_SEED_PREFIXES.some(function (p) { return str_(r.Description).indexOf(p) === 0; });
  });
}

function ensureSheet_(ss, name, cols) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#e7eefc');
    sh.setFrozenRows(1);
  } else {
    var head = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String) : [];
    var missing = cols.filter(function (c) { return head.indexOf(c) < 0; });
    if (missing.length) {
      sh.getRange(1, head.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold').setBackground('#e7eefc');
    }
  }
  // เก็บเป็นข้อความทั้งหมด: กัน Sheet แปลง 2026-10 / 2026-Q4 / 3 (ปานกลาง) เป็นค่าอื่น
  sh.getRange(2, 1, Math.max(1, sh.getMaxRows() - 1), sh.getMaxColumns()).setNumberFormat('@');
  return sh;
}

function importTaxonomy_(templateId) {
  var tpl = SpreadsheetApp.openById(templateId);
  var sh = tpl.getSheetByName('RISK TAXONOMY');
  var rows = [];
  if (sh) {
    sh.getDataRange().getValues().slice(1).forEach(function (r) {
      if (str_(r[0]) && str_(r[2])) rows.push({ Risk_Type: str_(r[0]), L2_Domain: str_(r[1]), Risk_Subtype: str_(r[2]), Description_TH: str_(r[3]), Description_EN: str_(r[4]) });
    });
  }
  if (!rows.length) {
    var m = tpl.getSheetByName('RISK_MASTER');
    if (m) m.getDataRange().getValues().slice(1).forEach(function (r) {
      if (str_(r[0]) && str_(r[1])) rows.push({ Risk_Type: str_(r[0]), L2_Domain: '', Risk_Subtype: str_(r[1]), Description_TH: '', Description_EN: '' });
    });
  }
  Db.append('Taxonomy', rows);
  return rows.length;
}

/** คัดลอกชีต MATRIX และ Impact & Likelihood ของ Sheet เดิมไว้อ้างอิง (ADMIN ใช้ปรับชีต Scale_Definitions ให้ตรง) */
function copyReferenceSheets_(ss, templateId) {
  var tpl = SpreadsheetApp.openById(templateId);
  ['Impact & Likelihood', 'MATRIX'].forEach(function (n) {
    var target = 'Ref_' + n.replace(/[^A-Za-z]+/g, '_');
    if (ss.getSheetByName(target)) return;
    var src = tpl.getSheetByName(n);
    if (src) src.copyTo(ss).setName(target);
  });
}

/** รันจาก editor: นำเข้า RISK_REGISTER จาก Sheet เดิม (TEMPLATE_ID) */
function importLegacyFromTemplate() {
  var cfg = getConfig_();
  console.log(JSON.stringify(importLegacyRegister_(cfg.TEMPLATE_ID, cfg.ASSESSMENT_PERIOD, currentEmail_() || 'setup')));
}

/** แปลงแถวของชีต RISK_REGISTER เดิม (คอลัมน์ A–AB) → object (pure, มี unit test) */
function legacyRowToRisk_(r) {
  var c = function (i) { return r[i] instanceof Date ? isoDate_(r[i]) : str_(r[i]); };
  return {
    legacyNo: c(0), period: c(1), businessUnit: c(2), riskId: c(3),
    risk: normalizeRisk_({
      Risk_Type: c(4), Risk_Subtype: c(5), Risk_Scenario: c(6), Risk_Cause: c(7), Consequences: c(8),
      Inherent_Impact: c(9), Inherent_Impact_Rationale: c(10), Inherent_Likelihood: c(11), Inherent_Likelihood_Rationale: c(12),
      Existing_Control: c(14),
      Residual_Impact: c(15), Residual_Impact_Rationale: c(16), Residual_Likelihood: c(17), Residual_Likelihood_Rationale: c(18),
      Mitigation_Plan: c(20), Mitigation_Due_Date: c(21), Risk_Owner: c(22)
    }),
    leading: c(23), lagging: c(24), green: c(25), amber: c(26), red: c(27)
  };
}

function importLegacyRegister_(sheetId, defaultPeriod, email) {
  var src = SpreadsheetApp.openById(sheetId).getSheetByName('RISK_REGISTER');
  if (!src) throw new Error('ไม่พบชีต RISK_REGISTER ในไฟล์ต้นทาง');
  var values = src.getDataRange().getValues().slice(1);
  return Db.withLock(function () {
    var depts = Db.readAll('Departments');
    var codes = depts.map(function (d) { return str_(d.Dept_Code).toUpperCase(); });
    var norm = function (s) { return str_(s).toUpperCase().replace(/&AMP;/g, '&').replace(/[^A-Z0-9ก-๙]/g, ''); };
    var findDept = function (bu) {
      var key = norm(bu);
      var d = depts.filter(function (x) { return norm(x.Dept_Code) === key || norm(x.Dept_Name) === key; })[0];
      return d ? str_(d.Dept_Code).toUpperCase() : null;
    };
    var riskIds = Db.readAll('Risks').map(function (r) { return r.Risk_ID; });
    var kriIds = Db.readAll('KRIs').map(function (k) { return k.KRI_ID; });
    var newDepts = [], risks = [], kris = [], skipped = 0;
    var now = Db.now();
    values.forEach(function (row) {
      var x = legacyRowToRisk_(row);
      if (!x.risk.Risk_Scenario) return;
      var bu = x.businessUnit || 'UNASSIGNED';
      var code = findDept(bu);
      if (!code) {
        code = deptCodeFromName_(bu, codes);
        codes.push(code);
        var nd = { Dept_Code: code, Dept_Name: bu, Approver_Email: '', Is_Active: 'TRUE' };
        depts.push(nd); newDepts.push(nd);
      }
      if (x.riskId && riskIds.indexOf(x.riskId) >= 0) { skipped++; return; }
      var id = x.riskId || nextRiskId_(code, riskIds);
      riskIds.push(id);
      var r = x.risk;
      r.Risk_ID = id;
      r.Risk_No = num_(x.legacyNo) || nextSeqId_(code + '-R-', riskIds.slice(0, -1));
      r.Assessment_Period = x.period || defaultPeriod;
      r.Business_Unit = code;
      r.Status = 'Active'; r.Version = 1;
      r.Created_By = email; r.Created_At = now; r.Updated_By = email; r.Updated_At = now;
      risks.push(r);
      [['Leading', x.leading], ['Lagging', x.lagging]].forEach(function (p) {
        if (!p[1]) return;
        var kid = nextKriId_(id, kriIds);
        kriIds.push(kid);
        kris.push({ KRI_ID: kid, Risk_ID: id, KRI_Type: p[0], KRI_Name: p[1], Unit: '', Frequency: 'Monthly', Direction: 'Qualitative',
          Amber_Threshold: '', Red_Threshold: '', Green_Text: x.green, Amber_Text: x.amber, Red_Text: x.red, Owner_Email: '', Is_Active: 'TRUE' });
      });
    });
    Db.append('Departments', newDepts);
    Db.append('Risks', risks);
    Db.append('KRIs', kris);
    Db.audit(email, 'IMPORT', 'Legacy', sheetId, null, { risks: risks.length, kris: kris.length, depts: newDepts.length, skipped: skipped });
    return { risks: risks.length, kris: kris.length, deptsCreated: newDepts.map(function (d) { return d.Dept_Code + ' = ' + d.Dept_Name; }), skipped: skipped,
      note: 'KRI ที่นำเข้าเป็นแบบ Qualitative — แก้เป็นตัวเลข + ตั้ง Amber/Red ในฟอร์ม Risk เพื่อให้ระบบคำนวณสถานะเอง' };
  });
}
