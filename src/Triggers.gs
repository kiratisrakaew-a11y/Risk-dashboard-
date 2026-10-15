/**
 * Triggers — งานอัตโนมัติและอีเมลแจ้งเตือน
 *   runAiBatch  ทุกชั่วโมง : AI ตรวจ Risk ที่แก้ไข + คำอธิบาย KRI ที่เป็น Amber/Red
 *   dailyJob    ทุกวัน 08:00 : เตือน KRI ค้างกรอก / แผนลดความเสี่ยงใกล้หรือเลยกำหนด (ตามวันที่ใน REMINDER_DAYS)
 */

function installTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['runAiBatch', 'dailyJob'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runAiBatch').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('dailyJob').timeBased().everyDays(1).atHour(8).create();
}

function webAppUrl_() {
  try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; }
}

function sendMail_(to, subject, html) {
  var list = {};
  (to || []).forEach(function (e) { e = str_(e).toLowerCase(); if (/@/.test(e)) list[e] = true; });
  var emails = Object.keys(list);
  if (!emails.length) return;
  var link = webAppUrl_();
  try {
    MailApp.sendEmail({
      to: emails.join(','), subject: '[Risk Register] ' + subject,
      htmlBody: '<div style="font-family:sans-serif;font-size:14px">' + html +
        (link ? '<p><a href="' + link + '">เปิดระบบ Risk Register</a></p>' : '') + '</div>'
    });
  } catch (e) { console.warn('ส่งอีเมลไม่ได้: ' + e.message); }
}

function adminEmails_() {
  return Db.readAll('Users').map(parseUser_).filter(function (u) { return u.active && u.role === 'ADMIN'; }).map(function (u) { return u.email; });
}

function editorEmails_(dept) {
  return Db.readAll('Users').map(parseUser_).filter(function (u) {
    return u.active && u.role === 'EDITOR' && (u.all || u.depts.indexOf(dept) >= 0);
  }).map(function (u) { return u.email; });
}

function notifyRedKris_(dept, reds) {
  var d = Db.readAll('Departments').filter(function (x) { return str_(x.Dept_Code).toUpperCase() === dept; })[0] || {};
  var html = '<p>KRI ของแผนก <b>' + escHtml_(d.Dept_Name || dept) + '</b> อยู่ในระดับ <b style="color:#c0392b">Red</b></p><ul>' +
    reds.map(function (x) {
      return '<li><b>' + escHtml_(x.k.KRI_Name) + '</b> งวด ' + escHtml_(x.row.Period) + ' = ' + escHtml_(x.row.Value) + ' ' + escHtml_(x.k.Unit) +
        '<br>สาเหตุ: ' + escHtml_(x.row.Comment) + '<br>การดำเนินการ: ' + escHtml_(x.row.Action_Taken || '-') + '</li>';
    }).join('') + '</ul>';
  sendMail_(adminEmails_().concat([d.Approver_Email]), 'KRI ระดับ Red — ' + (d.Dept_Name || dept), html);
}

function notifyApproval_(d, period, action, u, note, row) {
  var name = escHtml_(d.Dept_Name || d.Dept_Code);
  if (action === 'submit') {
    var to = d.Approver_Email ? [d.Approver_Email] : adminEmails_();
    sendMail_(to, 'ขออนุมัติ Risk Register ' + d.Dept_Name + ' งวด ' + period,
      '<p>' + escHtml_(u.name) + ' ส่ง Risk Register ของแผนก <b>' + name + '</b> งวด ' + escHtml_(period) + ' เพื่อขออนุมัติ</p>' +
      (note ? '<p>หมายเหตุ: ' + escHtml_(note) + '</p>' : ''));
  } else {
    sendMail_([row.Assessor], (action === 'approve' ? 'อนุมัติแล้ว' : 'ส่งกลับแก้ไข') + ' — Risk Register ' + d.Dept_Name + ' งวด ' + period,
      '<p>Risk Register ของแผนก <b>' + name + '</b> งวด ' + escHtml_(period) + ' ' + (action === 'approve' ? 'ได้รับการอนุมัติแล้ว' : 'ถูกส่งกลับให้แก้ไข') +
      ' โดย ' + escHtml_(u.name) + '</p>' + (note ? '<p>หมายเหตุ: ' + escHtml_(note) + '</p>' : ''));
  }
}

function dailyJob() {
  var cfg = getConfig_();
  var today = isoDate_(new Date());
  var day = Number(today.slice(8, 10));
  if (splitList_(cfg.REMINDER_DAYS).map(Number).indexOf(day) < 0) return;
  sendReminders_(cfg, today);
}

/** รวมรายการค้างของแต่ละคน แล้วส่งอีเมลคนละ 1 ฉบับ */
function sendReminders_(cfg, today) {
  var risks = {};
  Db.readAll('Risks').forEach(function (r) {
    if (r.Status !== 'Closed' && str_(r.Assessment_Period) === cfg.ASSESSMENT_PERIOD) risks[r.Risk_ID] = r;
  });
  var valIdx = indexKriValues_(Db.readAll('KRI_Values'));
  var byPerson = {};
  function add(emails, line) {
    emails.forEach(function (e) { e = str_(e).toLowerCase(); if (e) (byPerson[e] = byPerson[e] || []).push(line); });
  }
  var editorsCache = {};
  function editors(dept) { return editorsCache[dept] || (editorsCache[dept] = editorEmails_(dept)); }
  Db.readAll('KRIs').forEach(function (k) {
    var r = risks[k.Risk_ID];
    if (!r || !isActive_(k.Is_Active)) return;
    var s = kriSnapshot_(k, valIdx, today, cfg);
    if (!s.missing) return;
    var dept = str_(r.Business_Unit).toUpperCase();
    add(k.Owner_Email ? [k.Owner_Email] : editors(dept),
      '<li>[' + escHtml_(dept) + '] KRI <b>' + escHtml_(k.KRI_Name) + '</b> งวด ' + s.period + ' — กำหนดกรอก ' + s.due + (s.overdue ? ' <b style="color:#c0392b">(เลยกำหนด)</b>' : '') + '</li>');
  });
  Object.keys(risks).forEach(function (id) {
    var r = risks[id];
    var due = isoDate_(r.Mitigation_Due_Date);
    if (!str_(r.Mitigation_Plan) || r.Mitigation_Status === 'Done' || !due) return;
    var left = daysBetween_(today, due);
    if (left > cfg.MITIGATION_WARN_DAYS) return;
    var dept = str_(r.Business_Unit).toUpperCase();
    add(editors(dept), '<li>[' + escHtml_(dept) + '] แผนลดความเสี่ยง <b>' + escHtml_(r.Risk_ID) + '</b> ' + escHtml_(String(r.Risk_Scenario).slice(0, 80)) +
      ' — กำหนดเสร็จ ' + due + (left < 0 ? ' <b style="color:#c0392b">(เลยกำหนด ' + (-left) + ' วัน)</b>' : ' (อีก ' + left + ' วัน)') + '</li>');
  });
  Object.keys(byPerson).forEach(function (e) {
    sendMail_([e], 'รายการที่ต้องดำเนินการ (' + byPerson[e].length + ')', '<p>รายการ KRI / แผนลดความเสี่ยงที่ต้องดำเนินการ:</p><ul>' + byPerson[e].join('') + '</ul>');
  });
  return Object.keys(byPerson).length;
}
