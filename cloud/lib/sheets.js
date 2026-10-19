'use strict';
/**
 * อ่านค่าในชีตของ Google Sheet ผ่าน Sheets API (ใช้ตอนนำเข้า Risk Register เดิม และ migrate)
 * คืน array 2 มิติแบบเดียวกับ getDataRange().getValues() — เซลล์วันที่เป็น { $date: ms }
 */
const { GoogleAuth } = require('google-auth-library');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];
let auth = null;
function getAuth() { return auth || (auth = new GoogleAuth({ scopes: SCOPES })); }

async function serviceAccountEmail() {
  try { const c = await getAuth().getCredentials(); return c.client_email || ''; } catch (e) { return ''; }
}

/** serial ของ Google Sheet (วันที่ 1899-12-30 = 0, เวลาไทย) → epoch ms */
function serialToMs(n) {
  return Math.round((n - 25569) * 86400000) - 7 * 3600e3;
}

function gridToValues(rowData) {
  const rows = (rowData || []).map((r) => (r.values || []).map((c) => {
    const ev = c.effectiveValue;
    if (!ev) return '';
    const type = c.effectiveFormat && c.effectiveFormat.numberFormat && c.effectiveFormat.numberFormat.type;
    if (ev.numberValue !== undefined) return /^DATE/.test(type || '') ? { $date: serialToMs(ev.numberValue) } : ev.numberValue;
    if (ev.stringValue !== undefined) return ev.stringValue;
    if (ev.boolValue !== undefined) return ev.boolValue;
    if (ev.errorValue !== undefined) return '#ERROR!';
    return '';
  }));
  // ตัดแถว/คอลัมน์ว่างท้ายตาราง แล้วเติมให้เป็นสี่เหลี่ยม (เหมือน getDataRange)
  const blank = (v) => v === '' || v === null || v === undefined;
  while (rows.length && rows[rows.length - 1].every(blank)) rows.pop();
  let width = 0;
  rows.forEach((r) => { let w = r.length; while (w && blank(r[w - 1])) w--; width = Math.max(width, w); });
  return rows.map((r) => { const o = r.slice(0, width); while (o.length < width) o.push(''); return o; });
}

async function loadSheet(spreadsheetId, sheetName) {
  const client = await getAuth().getClient();
  const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(spreadsheetId) +
    '?includeGridData=true&ranges=' + encodeURIComponent("'" + sheetName.replace(/'/g, "''") + "'") +
    '&fields=' + encodeURIComponent('sheets(properties/title,data/rowData/values(effectiveValue,effectiveFormat/numberFormat/type))');
  let res;
  try {
    res = await client.request({ url });
  } catch (e) {
    const code = e.response && e.response.status;
    if (code === 400) return null; // ไม่มีชีตชื่อนี้
    if (code === 403 || code === 404) {
      const sa = await serviceAccountEmail();
      throw new Error('เปิดไฟล์ไม่ได้ — ให้แชร์ไฟล์ Google Sheet (สิทธิ์ Viewer) กับ ' + (sa || 'service account ของระบบ') + ' แล้วลองใหม่');
    }
    throw e;
  }
  const sheet = (res.data.sheets || [])[0];
  if (!sheet) return null;
  return gridToValues((sheet.data && sheet.data[0] && sheet.data[0].rowData) || []);
}

module.exports = { loadSheet, gridToValues, serialToMs, serviceAccountEmail };
