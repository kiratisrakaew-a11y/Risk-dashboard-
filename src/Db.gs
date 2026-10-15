/**
 * Db — อ่าน/เขียนไฟล์ "Risk Register — DB" แบบอ้างอิงชื่อคอลัมน์ (header แถวที่ 1)
 * - ทุกการเขียนต้องอยู่ใน Db.withLock() เพื่อกันผู้ใช้หลายคนบันทึกชนกัน
 * - ชีตข้อมูลตั้งรูปแบบเป็นข้อความ (@) ตอน setup เพื่อไม่ให้ Sheet แปลง 2026-10 เป็นวันที่เอง
 */

var Db = (function () {
  var ssMemo = null;
  var dataMemo = {};

  function dbId_() {
    var id = PropertiesService.getScriptProperties().getProperty('DB_ID');
    if (!id) throw new Error('ยังไม่ได้ตั้งค่า DB — ให้ผู้ดูแลรันฟังก์ชัน setup() ก่อน');
    return id;
  }

  function ss() { return ssMemo || (ssMemo = SpreadsheetApp.openById(dbId_())); }

  function sheet(name) {
    var sh = ss().getSheetByName(name);
    if (!sh) throw new Error('ไม่พบชีต ' + name + ' ใน DB — ให้ผู้ดูแลรัน setup() อีกครั้ง');
    return sh;
  }

  function cellOut_(v, header) {
    if (v instanceof Date) {
      if (header === 'Period') return Utilities.formatDate(v, TZ, 'yyyy-MM');
      if (/_At$|^At$/.test(header)) return Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm:ss");
      return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
    }
    return v;
  }

  /** อ่านทั้งชีตเป็น array ของ object (มี _row = เลขแถวใน Sheet) — memo ต่อ 1 execution */
  function readAll(name) {
    if (dataMemo[name]) return dataMemo[name];
    var values = sheet(name).getDataRange().getValues();
    var head = (values[0] || []).map(function (h) { return String(h).trim(); });
    var rows = [];
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      if (row.every(function (c) { return c === '' || c === null; })) continue;
      var o = { _row: i + 1 };
      head.forEach(function (h, j) { if (h) o[h] = cellOut_(row[j], h); });
      rows.push(o);
    }
    dataMemo[name] = rows;
    return rows;
  }

  function headers_(name) {
    var sh = sheet(name);
    return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  }

  function toRow_(head, obj) {
    return head.map(function (h) {
      var v = obj[h];
      return v === undefined || v === null ? '' : safeCell_(v);
    });
  }

  function append(name, objs) {
    if (!objs.length) return;
    var sh = sheet(name), head = headers_(name);
    var start = sh.getLastRow() + 1;
    if (start + objs.length - 1 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), objs.length + 50);
    sh.getRange(start, 1, objs.length, head.length).setNumberFormat('@')
      .setValues(objs.map(function (o) { return toRow_(head, o); }));
    delete dataMemo[name];
  }

  /** เขียนทับทั้งแถว (obj ควรเป็นแถวเดิมจาก readAll ที่แก้แล้ว) */
  function update(name, rowNum, obj) {
    var head = headers_(name);
    sheet(name).getRange(rowNum, 1, 1, head.length).setValues([toRow_(head, obj)]);
    delete dataMemo[name];
  }

  function clearMemo() { dataMemo = {}; }

  function withLock(fn) {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) throw new Error('ระบบกำลังบันทึกข้อมูลของผู้ใช้อื่น กรุณาลองใหม่อีกครั้ง');
    try {
      clearMemo();
      return fn();
    } finally {
      SpreadsheetApp.flush();
      lock.releaseLock();
    }
  }

  function now() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss"); }

  function audit(email, action, entity, id, before, after) {
    function j(x) { return x === undefined || x === null ? '' : JSON.stringify(x).slice(0, 45000); }
    append('Audit_Log', [{ At: now(), Email: email, Action: action, Entity: entity, Entity_ID: id,
      Before_JSON: j(before), After_JSON: j(after) }]);
  }

  /** อ่าน Settings จากไฟล์ที่ระบุ (ใช้ใน getConfig_ ก่อนมี memo) */
  function readSettings(id) {
    var sh = SpreadsheetApp.openById(id).getSheetByName('Settings');
    if (!sh) return {};
    var out = {};
    sh.getDataRange().getValues().slice(1).forEach(function (r) {
      if (r[0] !== '') out[String(r[0]).trim()] = r[1] instanceof Date ? Utilities.formatDate(r[1], TZ, 'yyyy-MM-dd') : r[1];
    });
    return out;
  }

  function writeSettings(obj) {
    var rows = readAll('Settings');
    Object.keys(obj).forEach(function (k) {
      var hit = rows.filter(function (r) { return r.Key === k; })[0];
      if (hit) { hit.Value = obj[k]; update('Settings', hit._row, hit); }
      else append('Settings', [{ Key: k, Value: obj[k], Description: '' }]);
      rows = readAll('Settings');
    });
    resetConfigMemo_();
  }

  function url() { return ss().getUrl(); }

  return {
    ss: ss, sheet: sheet, readAll: readAll, append: append, update: update, clearMemo: clearMemo,
    withLock: withLock, now: now, audit: audit, readSettings: readSettings, writeSettings: writeSettings, url: url
  };
})();
