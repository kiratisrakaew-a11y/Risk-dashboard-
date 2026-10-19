'use strict';
/**
 * Login ด้วยบัญชี Google ของบริษัท
 * 1) หน้าเว็บใช้ Google Identity Services ได้ ID token
 * 2) server ตรวจ token (aud = OAuth Client ID, โดเมน = ALLOWED_DOMAIN, อีเมลยืนยันแล้ว)
 * 3) ออก session cookie ที่เซ็นด้วย HMAC (HttpOnly) — สิทธิ์ในระบบยังตรวจจากชีต Users เหมือนเดิม
 */
const crypto = require('node:crypto');
const { OAuth2Client } = require('google-auth-library');

const COOKIE = 'rr_session';
const SESSION_HOURS = 12;

function b64(s) { return Buffer.from(s).toString('base64url'); }

function signSession(email, secret, now = Date.now()) {
  const body = b64(JSON.stringify({ e: email, x: now + SESSION_HOURS * 3600e3 }));
  const mac = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return body + '.' + mac;
}

function verifySession(token, secret, now = Date.now()) {
  if (!token || typeof token !== 'string' || token.indexOf('.') < 0) return null;
  const [body, mac] = token.split('.');
  const want = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(mac || ''), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let p;
  try { p = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch (e) { return null; }
  if (!p || !p.e || !(p.x > now)) return null;
  return String(p.e).toLowerCase();
}

/** ตรวจ payload ของ ID token (แยกออกมาเพื่อทดสอบ) */
function checkIdPayload(p, allowedDomain) {
  if (!p || !p.email) throw new Error('token ไม่มีอีเมล');
  if (p.email_verified === false) throw new Error('อีเมลยังไม่ได้ยืนยัน');
  const email = String(p.email).toLowerCase();
  if (allowedDomain) {
    const domains = String(allowedDomain).toLowerCase().split(/\s*,\s*/).filter(Boolean);
    const hd = String(p.hd || '').toLowerCase();
    if (domains.indexOf(hd) < 0 || domains.indexOf(email.split('@')[1]) < 0) throw new Error('ใช้ได้เฉพาะบัญชี @' + domains.join(', @'));
  }
  return email;
}

function createAuth({ clientId, allowedDomain }) {
  const client = new OAuth2Client(clientId);
  async function verifyIdToken(idToken) {
    if (!clientId) throw new Error('ยังไม่ได้ตั้งค่า OAUTH_CLIENT_ID');
    const ticket = await client.verifyIdToken({ idToken, audience: clientId });
    return checkIdPayload(ticket.getPayload(), allowedDomain);
  }
  /** token ของ Cloud Scheduler (OIDC) — ตรวจ audience และอีเมล service account ที่อนุญาต */
  async function verifyCronToken(idToken, audience, allowedEmail) {
    const ticket = await client.verifyIdToken({ idToken, audience });
    const p = ticket.getPayload();
    if (!p || !p.email_verified || String(p.email).toLowerCase() !== String(allowedEmail || '').toLowerCase()) throw new Error('cron token ไม่ถูกต้อง');
    return p.email;
  }
  return { verifyIdToken, verifyCronToken };
}

function readCookie(req, name) {
  const h = req.headers.cookie || '';
  const m = h.split(/;\s*/).find((c) => c.indexOf(name + '=') === 0);
  return m ? decodeURIComponent(m.slice(name.length + 1)) : '';
}

module.exports = { COOKIE, SESSION_HOURS, signSession, verifySession, checkIdPayload, createAuth, readCookie };
