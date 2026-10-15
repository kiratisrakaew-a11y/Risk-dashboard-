/**
 * Auth — สิทธิ์ 3 ระดับจากชีต Users
 *   ADMIN  : เห็น/แก้ทุกแผนก + ตั้งค่า
 *   EDITOR : กรอก/แก้ข้อมูลของแผนกตัวเอง (Departments คั่นด้วย , ได้หลายแผนก)
 *   VIEWER : ดู Dashboard/ข้อมูลของแผนกตัวเองเท่านั้น
 * ผู้อนุมัติของแผนก (Departments.Approver_Email) อนุมัติ/ส่งกลับงวดประเมินของแผนกนั้นได้ และเห็นข้อมูลแผนกนั้น
 * ทุก API ใช้สิทธิ์จากอีเมลผู้ใช้ฝั่ง server เท่านั้น — ไม่เชื่อค่าแผนกที่ส่งมาจากหน้าเว็บ
 */

/** แปลงแถว Users → user object (pure) */
function parseUser_(row) {
  var role = str_(row.Role).toUpperCase();
  var depts = splitList_(row.Departments).map(function (d) { return d.toUpperCase(); });
  return {
    email: str_(row.Email).toLowerCase(),
    name: str_(row.Name) || str_(row.Email),
    role: ROLES.indexOf(role) >= 0 ? role : 'VIEWER',
    depts: depts.filter(function (d) { return d !== '*'; }),
    all: depts.indexOf('*') >= 0,
    active: isActive_(row.Is_Active)
  };
}

/** หา user จากอีเมล (pure) — ไม่พบ/ไม่ active = null; ผู้อนุมัติที่ไม่มีในชีต Users ได้สิทธิ์ VIEWER ของแผนกที่อนุมัติ */
function resolveUser_(email, userRows, deptRows) {
  email = str_(email).toLowerCase();
  if (!email) return null;
  var u = null;
  (userRows || []).forEach(function (r) {
    var p = parseUser_(r);
    if (p.email === email && p.active) u = p;
  });
  var approverOf = (deptRows || []).filter(function (d) {
    return str_(d.Approver_Email).toLowerCase() === email && isActive_(d.Is_Active);
  }).map(function (d) { return str_(d.Dept_Code).toUpperCase(); });
  if (!u && !approverOf.length) return null;
  if (!u) u = { email: email, name: email, role: 'VIEWER', depts: [], all: false, active: true };
  u.approverOf = approverOf;
  return u;
}

function canView_(u, dept) {
  if (!u) return false;
  dept = String(dept || '').toUpperCase();
  return u.role === 'ADMIN' || u.all || u.depts.indexOf(dept) >= 0 || (u.approverOf || []).indexOf(dept) >= 0;
}

function canEdit_(u, dept) {
  if (!u) return false;
  dept = String(dept || '').toUpperCase();
  return u.role === 'ADMIN' || (u.role === 'EDITOR' && (u.all || u.depts.indexOf(dept) >= 0));
}

function canApprove_(u, dept) {
  if (!u) return false;
  return u.role === 'ADMIN' || (u.approverOf || []).indexOf(String(dept || '').toUpperCase()) >= 0;
}

/** แผนกที่ผู้ใช้เห็นได้ (จากรายการแผนกที่ active) */
function visibleDepts_(u, deptRows) {
  return (deptRows || []).filter(function (d) { return isActive_(d.Is_Active) && canView_(u, d.Dept_Code); });
}

// ============================ runtime ============================

function currentEmail_() {
  return String(Session.getActiveUser().getEmail() || '').toLowerCase();
}

var userMemo_ = null;

function currentUser_() {
  if (userMemo_) return userMemo_;
  userMemo_ = resolveUser_(currentEmail_(), Db.readAll('Users'), Db.readAll('Departments'));
  return userMemo_;
}

function requireUser_() {
  var u = currentUser_();
  if (!u) throw new Error('ไม่มีสิทธิ์เข้าใช้ (' + (currentEmail_() || 'ไม่ทราบอีเมล') + ') — ติดต่อผู้ดูแลระบบให้เพิ่มในชีต Users');
  return u;
}

function requireAdmin_() {
  var u = requireUser_();
  if (u.role !== 'ADMIN') throw new Error('เฉพาะ ADMIN เท่านั้น');
  return u;
}

function requireView_(u, dept) {
  if (!canView_(u, dept)) throw new Error('ไม่มีสิทธิ์ดูข้อมูลแผนก ' + dept);
}

function requireEdit_(u, dept) {
  if (!canEdit_(u, dept)) throw new Error('ไม่มีสิทธิ์แก้ไขข้อมูลแผนก ' + dept);
}
