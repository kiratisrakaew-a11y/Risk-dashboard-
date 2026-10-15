const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./load')();
const plain = (x) => JSON.parse(JSON.stringify(x));
const data = require('./fixtures')(G);
const cfg = G.mergeConfig_({}, { KRI_DUE_DAY: 10 }, new Date('2026-10-15T00:00:00Z'));
const run = (codes) => G.computeDashboard_(data, { deptCodes: codes, period: '2026', today: '2026-10-15', cfg });

test('แผนก FIN เห็นเฉพาะข้อมูล FIN (ไม่รั่วไป HR) และไม่นับ Risk ที่ปิด/งวดอื่น', () => {
  const d = run(['FIN']);
  const s = JSON.stringify(d);
  assert.ok(!/HR-R-001/.test(s), 'ข้อมูล HR ต้องไม่หลุดมา');
  assert.ok(!/FIN-R-004|FIN-R-005/.test(s));
  assert.equal(d.kpi.risks, 3);
  assert.equal(d.kpi.byResidual.High, 1);
  assert.equal(d.kpi.byResidual.Low, 2);
  assert.equal(d.kpi.highPlus, 1);
  assert.equal(d.kpi.kris, 3);                      // ไม่นับ KRI ที่ปิด
  assert.deepEqual(plain(d.depts), ['FIN']);
});

test('heatmap [likelihood-1][impact-1]', () => {
  const d = run(['FIN']);
  assert.deepEqual(plain(d.heat.inherent[4][4]), ['FIN-R-001']);
  assert.deepEqual(plain(d.heat.residual[3][3]), ['FIN-R-001']);
  assert.deepEqual(plain(d.heat.residual[0][0]), ['FIN-R-003']);
});

test('KRI: สถานะงวดล่าสุด, ค้างกรอก, เลยกำหนด', () => {
  const d = run(['FIN']);
  const k = Object.fromEntries(d.kriRows.map((r) => [r.KRI_ID, r.snapshot]));
  assert.equal(k['FIN-R-001-K1'].period, '2026-09');
  assert.equal(k['FIN-R-001-K1'].status, 'Red');
  assert.equal(k['FIN-R-001-K1'].prevStatus, 'Amber');
  assert.equal(k['FIN-R-001-K1'].overdue, false);
  assert.equal(k['FIN-R-001-K2'].period, '2026-Q3');  // รายไตรมาส
  assert.equal(k['FIN-R-001-K2'].missing, true);
  assert.equal(k['FIN-R-001-K2'].due, '2026-10-10');
  assert.equal(k['FIN-R-001-K2'].overdue, true);      // ไตรมาส 3 ครบกำหนด 10 ต.ค. → วันที่ 15 เลยแล้ว
  assert.equal(k['FIN-R-002-K1'].missing, true);
  assert.equal(k['FIN-R-002-K1'].overdue, true);      // ก.ย. ครบกำหนด 10 ต.ค.
  assert.equal(k['FIN-R-002-K1'].lastStatus, 'Green');
  assert.equal(d.kpi.kriRed, 1);
  assert.equal(d.kpi.kriGreen, 2);                    // K2 (Q2 Green) + uptime (ส.ค. Green)
  assert.equal(d.kpi.kriMissing, 2);
  assert.equal(d.kpi.kriOverdue, 2);
});

test('Mitigation เลยกำหนด / ใกล้กำหนด, AI เฉลี่ย, Top risks', () => {
  const d = run(['FIN']);
  assert.equal(d.kpi.mitOpen, 2);
  assert.equal(d.kpi.mitOverdue, 1);
  assert.equal(d.kpi.mitDueSoon, 1);
  assert.equal(d.mitigation[0].Risk_ID, 'FIN-R-001');
  assert.equal(d.kpi.aiAvg, 75);
  assert.equal(d.kpi.aiLow, 1);
  assert.equal(d.topRisks[0].Risk_ID, 'FIN-R-001');
  assert.equal(d.topRisks[0].kriStatus, 'Red');
});

test('ภาพรวมหลายแผนก: สรุปรายแผนก + สถานะอนุมัติ', () => {
  const d = run(['FIN', 'HR']);
  assert.equal(d.kpi.risks, 4);
  const hr = d.byDept.find((x) => x.code === 'HR');
  const fin = d.byDept.find((x) => x.code === 'FIN');
  assert.equal(hr.name, 'Human Resources');
  assert.equal(hr.highPlus, 1);
  assert.equal(hr.red, 1);
  assert.equal(hr.approval, 'Draft');
  assert.equal(fin.approval, 'Submitted');
  assert.equal(fin.overdue, 2);
  assert.equal(fin.aiAvg, 75);
});

test('trend 6 เดือน นับ KRI รายไตรมาสที่เดือนสิ้นไตรมาส', () => {
  const d = run(['FIN']);
  assert.deepEqual(plain(d.trend.periods), ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
  assert.deepEqual(plain(d.trend.Red), [0, 0, 0, 0, 0, 1]);
  assert.deepEqual(plain(d.trend.Amber), [0, 0, 0, 0, 1, 0]);
  assert.deepEqual(plain(d.trend.Green), [0, 0, 1, 0, 1, 0]);   // Q2 ที่ มิ.ย. + uptime ส.ค.
});
