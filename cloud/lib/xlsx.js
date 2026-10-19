'use strict';
/** สร้างไฟล์ Excel ตามรูปแบบ RISK_REGISTER เดิม จากข้อมูลของ exportData_ (src/Export.gs) */
const ExcelJS = require('exceljs');

async function buildRegisterXlsx(f) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Risk Register';
  const ws = wb.addWorksheet('RISK_REGISTER', { views: [{ state: 'frozen', ySplit: 1, xSplit: 4 }] });
  ws.addRow(f.headers);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } };
  f.rows.forEach((r) => ws.addRow(r.map((v) => (v === null || v === undefined ? '' : v))));
  const wide = { 6: 50, 7: 40, 8: 40, 10: 35, 12: 35, 14: 45, 16: 35, 18: 35, 20: 45, 23: 35, 24: 35, 25: 30, 26: 30, 27: 30 };
  f.headers.forEach((h, i) => { ws.getColumn(i + 1).width = wide[i] || 16; });
  ws.eachRow((row) => { row.alignment = { vertical: 'top', wrapText: true }; });
  const ar = wb.addWorksheet('Assesment-Review person') // Excel ห้ามมี / ในชื่อชีต;
  ar.getCell('A1').value = 'ผู้ประเมิน'; ar.getCell('C1').value = 'วันที่';
  ar.getCell('A2').value = 'ผู้อนุมัติ'; ar.getCell('C2').value = 'วันที่';
  if (f.approval) {
    ar.getCell('B1').value = f.approval.assessor; ar.getCell('D1').value = f.approval.assessedAt;
    ar.getCell('B2').value = f.approval.approver; ar.getCell('D2').value = f.approval.approvedAt;
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { buildRegisterXlsx };
