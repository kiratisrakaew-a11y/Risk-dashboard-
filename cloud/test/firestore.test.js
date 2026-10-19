'use strict';
// ทดสอบกับ Firestore emulator จริง — รันเมื่อมี FIRESTORE_EMULATOR_HOST เท่านั้น
//   java -jar cloud-firestore-emulator.jar --host 127.0.0.1 --port 8786
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8786 npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRuntime } = require('../lib/runtime');
const SEED = require('./fixture-seed');

const skip = !process.env.FIRESTORE_EMULATOR_HOST && 'ไม่มี FIRESTORE_EMULATOR_HOST';

test('Firestore: ย้ายข้อมูล → บันทึก → instance ใหม่โหลดเห็นข้อมูล / version ตรงกัน', { skip }, async () => {
  const { FirestoreStore } = require('../lib/stores');
  const projectId = 'test-' + Date.now();
  const store = new FirestoreStore({ projectId });
  for (const name of Object.keys(SEED)) {
    const ops = SEED[name].map((r, i) => { const d = { ...r, _seq: i + 1 }; delete d._row; return { name, id: store.newId(name), data: d }; });
    await store.commit(ops, [name]);
  }
  assert.equal(await store.count('Risks'), SEED.Risks.length);
  const mk = () => createRuntime({ store, props: {}, fetchImpl: async () => ({ code: 500, body: '' }), extraFiles: [path.join(__dirname, '..', 'gs', 'CloudOverrides.js')] });
  const a = mk();
  const risk = JSON.parse((await a.run('apiGetRisk', ['OPS-R-003'], { email: 'editor@co.th' })).value).risk;
  risk.Risk_Owner = 'คนใหม่';
  await a.run('apiSaveRisk', [{ dept: 'OPS', risk, kris: [] }], { email: 'editor@co.th' });
  // instance ใหม่ (เหมือน Cloud Run เริ่มใหม่) ต้องเห็นค่าที่บันทึก
  const b = mk();
  const again = JSON.parse((await b.run('apiGetRisk', ['OPS-R-003'], { email: 'editor@co.th' })).value).risk;
  assert.equal(again.Risk_Owner, 'คนใหม่');
  assert.equal(Number(again.Version), Number(risk.Version) + 1);
  // instance a เห็นการแก้จาก b (version เปลี่ยน → โหลดใหม่)
  again.Risk_Owner = 'คนที่สาม';
  await b.run('apiSaveRisk', [{ dept: 'OPS', risk: again, kris: [] }], { email: 'editor@co.th' });
  const fromA = JSON.parse((await a.run('apiGetRisk', ['OPS-R-003'], { email: 'editor@co.th' })).value).risk;
  assert.equal(fromA.Risk_Owner, 'คนที่สาม');
  const meta = await store.getMeta();
  assert.ok(meta.versions.Risks >= 3);
  const audit = await store.load('Audit_Log');
  assert.equal(audit.filter((x) => x.Entity_ID === 'OPS-R-003' && x.Action === 'UPDATE' && x.Entity === 'Risk').length, 2);
  const s1 = await store.getSecret(), s2 = await store.getSecret();
  assert.equal(s1, s2);
  await store.clear('Audit_Log');
  assert.equal(await store.count('Audit_Log'), 0);
});
