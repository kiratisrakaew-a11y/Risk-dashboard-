// Apps Script โหลดไฟล์ทีละไฟล์ตามลำดับ — ค่าระดับบนสุดของแต่ละไฟล์ต้องไม่อ้างถึงไฟล์อื่น
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', 'src');

test('ทุกไฟล์ .gs โหลดเดี่ยวๆ ได้ (ไม่พึ่งลำดับไฟล์)', () => {
  for (const f of fs.readdirSync(SRC).filter((x) => x.endsWith('.gs'))) {
    const ctx = vm.createContext({ console });
    assert.doesNotThrow(() => vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f }), f);
  }
});
