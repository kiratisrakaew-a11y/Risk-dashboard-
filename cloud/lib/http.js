'use strict';
/** ทำคำขอ HTTP แทน UrlFetchApp (ใช้กับ AI provider) — คืน { code, body } เหมือน muteHttpExceptions */
async function fetchImpl(req) {
  const headers = { ...(req.headers || {}) };
  if (req.contentType && !Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) headers['Content-Type'] = req.contentType;
  const res = await fetch(req.url, {
    method: req.method || 'GET',
    headers,
    body: req.method && req.method !== 'GET' ? req.payload : undefined,
    signal: AbortSignal.timeout(Number(process.env.FETCH_TIMEOUT_MS) || 180000)
  });
  return { code: res.status, body: await res.text() };
}
module.exports = { fetchImpl };
