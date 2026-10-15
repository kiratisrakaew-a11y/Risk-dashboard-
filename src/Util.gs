/**
 * Util — helper ที่เป็น pure function (มี unit test)
 */

var BKK_OFFSET_MS = 7 * 3600 * 1000;

/** วันที่เวลาไทย (UTC+7) รูปแบบ YYYY-MM-DD — รับ Date, ISO string หรือ 'YYYY-MM-DD' */
function isoDate_(d) {
  if (d === null || d === undefined || d === '') return '';
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  var t = d instanceof Date ? d.getTime() : new Date(d).getTime();
  if (isNaN(t)) return '';
  return new Date(t + BKK_OFFSET_MS).toISOString().slice(0, 10);
}

/** จำนวนวันจาก a ถึง b (YYYY-MM-DD) */
function daysBetween_(a, b) {
  if (!a || !b) return null;
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

function addDays_(iso, n) {
  return new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
}

function bool_(v) {
  if (v === true) return true;
  var s = String(v === undefined || v === null ? '' : v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y';
}

/** ช่อง Is_Active: ว่าง = ใช้งาน, FALSE/0/no = ปิด */
function isActive_(v) {
  if (v === false) return false;
  var s = String(v === undefined || v === null ? '' : v).trim();
  return s === '' || bool_(s);
}

function num_(v) {
  if (v === null || v === undefined || v === '') return null;
  var n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
  return isNaN(n) ? null : n;
}

/** ระดับ 1–5 จากค่าอย่าง 3, "3", "3 (ปานกลาง)" — นอกช่วง = null */
function level_(v) {
  var m = String(v === null || v === undefined ? '' : v).match(/^\s*([1-5])\b/);
  return m ? Number(m[1]) : null;
}

function splitList_(s) {
  return String(s || '').split(/[,\n;]/).map(function (x) { return x.trim(); }).filter(String);
}

function str_(v) { return v === null || v === undefined ? '' : String(v).trim(); }

/** hash สั้นๆ (FNV-1a 32 bit) — ใช้เป็น fingerprint ว่าเนื้อหาเปลี่ยนหรือยัง */
function hash_(s) {
  s = String(s);
  var h = 0x811c9dc5;
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

/** กันข้อความที่ขึ้นต้นด้วย = ถูกตีความเป็นสูตรใน Sheet (ชีตข้อมูลตั้งรูปแบบเป็นข้อความอยู่แล้ว — กันซ้ำอีกชั้น) */
function safeCell_(v) {
  if (typeof v !== 'string') return v;
  return /^=/.test(v) ? "'" + v : v;
}

function escHtml_(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
