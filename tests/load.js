// โหลดไฟล์ .gs ทั้งหมดเข้า context เดียวกัน (เหมือน global scope ของ Apps Script)
// ไฟล์ที่เรียก service ของ Google ทำงานเฉพาะตอนเรียกฟังก์ชัน จึงโหลดได้โดยไม่ต้อง mock
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', 'src');

module.exports = function load() {
  const ctx = vm.createContext({ console });
  const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.gs')).sort();
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  }
  return ctx;
};
