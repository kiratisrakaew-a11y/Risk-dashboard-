'use strict';
/** ประกอบหน้าเว็บจาก src/ui/*.html ชุดเดียวกับ Apps Script + shim ของ google.script.run */
const fs = require('node:fs');
const path = require('node:path');

const UI = path.join(__dirname, '..', '..', 'src', 'ui');

function esc(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function jsonForScript(v) {
  return JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

// google.script.run → POST api/<fn> (cookie session) — App.html ใช้ได้โดยไม่ต้องแก้
const RUN_SHIM = `<script>
var google = { script: { run: (function () {
  function runner(ok, fail) {
    return new Proxy({}, { get: function (_, fn) {
      if (fn === 'withSuccessHandler') return function (h) { return runner(h, fail); };
      if (fn === 'withFailureHandler') return function (h) { return runner(ok, h); };
      return function () {
        var args = Array.prototype.slice.call(arguments);
        fetch('api/' + encodeURIComponent(fn), { method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, body: JSON.stringify({ args: args }) })
          .then(function (r) {
            if (r.status === 401) { location.reload(); throw new Error('หมดเวลาการเข้าสู่ระบบ — กำลังโหลดหน้าใหม่'); }
            return r.json();
          })
          .then(function (j) { if (j.ok) { if (ok) ok(j.value); } else if (fail) fail(new Error(j.error)); })
          .catch(function (e) { if (fail) fail(e); });
      };
    } });
  }
  return runner(null, null);
})() } };
</script>`;

function loadTemplate() {
  const read = (n) => fs.readFileSync(path.join(UI, n + '.html'), 'utf8');
  return read('Index')
    .replace("<?!= include_('ui/Styles'); ?>", () => read('Styles'))
    .replace("<?!= include_('ui/App'); ?>", () => '<!--INIT-->' + RUN_SHIM + read('App'))
    .replace('<?= userName ?>', '<!--USER-->');
}

function createPages({ clientId, allowedDomain }) {
  const tpl = loadTemplate();
  return {
    app(userName, init) {
      return tpl.replace('<!--USER-->', () => esc(userName))
        .replace('<!--INIT-->', () => '<script>window.INIT_DATA = ' + jsonForScript(init) + ';</script>');
    },
    login(message) {
      const domain = String(allowedDomain || '').split(',')[0].trim();
      return shell('เข้าสู่ระบบ', `
        <h2>Risk Register &amp; KRI</h2>
        <p>เข้าสู่ระบบด้วยบัญชี Google ของบริษัท${domain ? ' (@' + esc(domain) + ')' : ''}</p>
        ${message ? '<p class="err">' + esc(message) + '</p>' : ''}
        <div id="gbtn" style="display:inline-block;margin-top:8px"></div>
        <p id="msg" class="err"></p>
        <script src="https://accounts.google.com/gsi/client" async onload="init()"></script>
        <script>
          function init() {
            google.accounts.id.initialize({ client_id: ${jsonForScript(clientId || '')}, hd: ${jsonForScript(domain)}, ux_mode: 'popup',
              callback: function (r) {
                fetch('auth/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
                  body: JSON.stringify({ credential: r.credential }) }).then(function (x) { return x.json(); }).then(function (j) {
                    if (j.ok) location.reload(); else document.getElementById('msg').textContent = j.error;
                  });
              } });
            google.accounts.id.renderButton(document.getElementById('gbtn'), { theme: 'filled_blue', size: 'large', text: 'signin_with', locale: 'th' });
          }
        </script>`);
    },
    error(message) {
      return shell('ไม่มีสิทธิ์เข้าใช้', '<h2>ไม่มีสิทธิ์เข้าใช้</h2><p>' + esc(message) + '</p>' +
        '<form method="post" action="auth/logout"><button>ออกจากระบบ / ใช้บัญชีอื่น</button></form>');
    }
  };
}

function shell(title, body) {
  return `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — Risk Register</title>
<style>body{font-family:'IBM Plex Sans Thai',system-ui,sans-serif;background:#f5f6f8;color:#1f2937;margin:0;padding:64px 16px;text-align:center}
.card{max-width:420px;margin:0 auto;background:#fff;border-radius:12px;padding:32px 24px;box-shadow:0 1px 3px rgba(0,0,0,.1)}
.err{color:#c0392b}button{padding:8px 16px;border-radius:6px;border:1px solid #ccc;background:#fff;cursor:pointer}</style>
</head><body><div class="card">${body}</div></body></html>`;
}

module.exports = { createPages, jsonForScript, RUN_SHIM };
