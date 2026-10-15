const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./load')();

const USERS = [
  { Email: 'Admin@co.th', Name: 'A', Role: 'ADMIN', Departments: '', Is_Active: 'TRUE' },
  { Email: 'fin.editor@co.th', Role: 'EDITOR', Departments: 'fin, hr', Is_Active: 'TRUE' },
  { Email: 'fin.viewer@co.th', Role: 'VIEWER', Departments: 'FIN', Is_Active: 'TRUE' },
  { Email: 'all.viewer@co.th', Role: 'viewer', Departments: '*', Is_Active: 'TRUE' },
  { Email: 'gone@co.th', Role: 'EDITOR', Departments: 'FIN', Is_Active: 'FALSE' },
  { Email: 'weird@co.th', Role: 'SUPERUSER', Departments: 'FIN', Is_Active: '' }
];
const DEPTS = [
  { Dept_Code: 'FIN', Dept_Name: 'Finance', Approver_Email: 'cfo@co.th', Is_Active: 'TRUE' },
  { Dept_Code: 'HR', Dept_Name: 'HR', Approver_Email: 'fin.viewer@co.th', Is_Active: 'TRUE' },
  { Dept_Code: 'OPS', Dept_Name: 'Ops', Approver_Email: '', Is_Active: 'TRUE' },
  { Dept_Code: 'OLD', Dept_Name: 'Old', Approver_Email: '', Is_Active: 'FALSE' }
];
const who = (e) => G.resolveUser_(e, USERS, DEPTS);
const codes = (u) => G.visibleDepts_(u, DEPTS).map((d) => d.Dept_Code).join(',');

test('ADMIN เห็น/แก้/อนุมัติทุกแผนก', () => {
  const u = who('admin@co.th');
  assert.equal(u.role, 'ADMIN');
  assert.equal(codes(u), 'FIN,HR,OPS');
  assert.ok(G.canEdit_(u, 'OPS') && G.canApprove_(u, 'OPS'));
});

test('EDITOR แก้ได้เฉพาะแผนกตัวเอง ไม่อนุมัติ', () => {
  const u = who('FIN.EDITOR@co.th');
  assert.equal(codes(u), 'FIN,HR');
  assert.ok(G.canEdit_(u, 'fin'));
  assert.ok(!G.canEdit_(u, 'OPS'));
  assert.ok(!G.canView_(u, 'OPS'));
  assert.ok(!G.canApprove_(u, 'FIN'));
});

test('VIEWER ดูได้อย่างเดียว; ผู้อนุมัติเห็นแผนกที่อนุมัติด้วย', () => {
  const u = who('fin.viewer@co.th');
  assert.equal(codes(u), 'FIN,HR');            // FIN จาก Users + HR เพราะเป็นผู้อนุมัติ
  assert.ok(!G.canEdit_(u, 'FIN'));
  assert.ok(G.canApprove_(u, 'HR'));
  assert.ok(!G.canApprove_(u, 'FIN'));
});

test('ผู้อนุมัติที่ไม่มีในชีต Users เห็นเฉพาะแผนกที่อนุมัติ', () => {
  const u = who('cfo@co.th');
  assert.equal(u.role, 'VIEWER');
  assert.equal(codes(u), 'FIN');
  assert.ok(G.canApprove_(u, 'FIN'));
  assert.ok(!G.canEdit_(u, 'FIN'));
});

test('* = ทุกแผนก; ผู้ใช้ปิดใช้งาน/ไม่รู้จัก = ไม่มีสิทธิ์; Role แปลก = VIEWER', () => {
  assert.equal(codes(who('all.viewer@co.th')), 'FIN,HR,OPS');
  assert.equal(who('gone@co.th'), null);
  assert.equal(who('nobody@co.th'), null);
  assert.equal(who(''), null);
  const w = who('weird@co.th');
  assert.equal(w.role, 'VIEWER');
  assert.ok(!G.canEdit_(w, 'FIN'));
  assert.ok(!G.canView_(null, 'FIN'));
});
