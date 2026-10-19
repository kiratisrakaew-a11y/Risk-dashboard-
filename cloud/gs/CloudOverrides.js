/**
 * ส่วนที่ต่างจาก Apps Script เฉพาะบน Cloud (โหลดต่อจาก src/*.gs)
 * business rule ทั้งหมดยังมาจาก src/*.gs — ไฟล์นี้แทนเฉพาะส่วนที่ผูกกับ Google Sheet / Drive
 */

/** Export: สร้างไฟล์ .xlsx ให้ดาวน์โหลด แทนการสร้าง Google Sheet (ข้อมูลจาก exportData_ ชุดเดียวกัน) */
function exportRegister_(dept, period, u) {
  var data = exportData_(dept, period, u);
  var token = __cloud.addFile({ type: 'register', name: data.name, headers: data.headers, rows: data.rows, approval: data.approval, email: u.email });
  var url = 'download/' + token;
  Db.withLock(function () { Db.audit(u.email, 'EXPORT', 'Register', (dept || 'ALL') + '/' + period, null, { rows: data.rows.length, file: data.name + '.xlsx' }); });
  return { url: url, rows: data.rows.length, name: data.name, label: 'ดาวน์โหลดไฟล์ Excel (.xlsx)' };
}

/** ติดตั้ง trigger: บน Cloud ใช้ Cloud Scheduler แทน */
function installTriggers_() {}
