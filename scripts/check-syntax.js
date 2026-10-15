// ตรวจ syntax ของไฟล์ .gs และ <script> ใน ui/*.html ก่อน clasp push
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', 'src');
let bad = 0;
function check(code, name) {
  try { new vm.Script(code, { filename: name }); } catch (e) { bad++; console.error('✗ ' + name + ': ' + e.message); }
}
for (const f of fs.readdirSync(SRC).filter((x) => x.endsWith('.gs'))) check(fs.readFileSync(path.join(SRC, f), 'utf8'), f);
for (const f of fs.readdirSync(path.join(SRC, 'ui')).filter((x) => x.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(SRC, 'ui', f), 'utf8');
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m, i = 0;
  while ((m = re.exec(html))) check(m[1], 'ui/' + f + '#script' + (i++));
}
JSON.parse(fs.readFileSync(path.join(SRC, 'appsscript.json'), 'utf8'));
if (bad) { console.error(bad + ' ไฟล์มี syntax error'); process.exit(1); }
console.log('✓ syntax OK');
