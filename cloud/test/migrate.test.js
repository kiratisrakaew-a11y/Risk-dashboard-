'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { rowsToObjects } = require('../migrate');

test('migrate: แปลงแถวชีตเป็น document — ข้ามแถวว่าง, ลำดับเดิม, วันที่ตามรูปแบบของ Db.gs', () => {
  const at = Date.UTC(2026, 9, 1, 3, 0, 0); // 10:00 เวลาไทย
  const rows = rowsToObjects([
    ['Risk_ID', 'Mitigation_Due_Date', 'Updated_At', 'Period', ''],
    ['IT-R-001', { $date: Date.UTC(2026, 11, 30, 17) }, { $date: at }, { $date: Date.UTC(2026, 8, 30, 17) }, 'x'],
    ['', '', '', '', ''],
    ['IT-R-002', '', '', '', '']
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { _seq: 1, Risk_ID: 'IT-R-001', Mitigation_Due_Date: '2026-12-31', Updated_At: '2026-10-01T10:00:00', Period: '2026-10' });
  assert.equal(rows[1]._seq, 3);
  assert.deepEqual(rowsToObjects([]), []);
});
