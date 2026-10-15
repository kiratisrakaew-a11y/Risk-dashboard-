/**
 * Config — ค่าตั้งต้นและการอ่านค่าตั้ง
 *
 * ลำดับความสำคัญ: ชีต Settings ใน DB  >  Script Properties  >  DEFAULTS
 * API key อ่านจาก Script Properties เท่านั้น (ห้ามเก็บในชีต)
 */

var DEFAULTS = {
  DB_ID: '',                         // ไฟล์ "Risk Register — DB" (setup() สร้างและเก็บให้เอง)
  TEMPLATE_ID: '1nph4NlZzmGfu8f9HuUT-KDKAxI30CXz93Sm0v8x0qFs', // RISK_REGISTER_TEMPLATE (ใช้ import taxonomy + export)
  ASSESSMENT_PERIOD: '',             // งวดประเมินปัจจุบัน เช่น 2026 หรือ 2026-H2 (ว่าง = ปีปัจจุบัน)
  KRI_DUE_DAY: 10,                   // ค่า KRI ของงวดที่ปิดแล้วต้องกรอกภายในวันที่เท่าไหร่ของเดือนถัดไป
  REMINDER_DAYS: '1,5,10',           // วันที่ของเดือนที่ส่งอีเมลเตือน KRI ค้างกรอก
  MITIGATION_WARN_DAYS: 30,          // แผนลดความเสี่ยงที่ครบกำหนดภายในกี่วัน = ใกล้ครบกำหนด
  AI_PROVIDER: 'gemini',             // gemini | claude | openai
  AI_MODEL: '',                      // ว่าง = ใช้ DEFAULT_MODELS[provider]
  AI_EFFORT: 'low',                  // Claude = effort, Gemini 3 = thinking level (low เร็วกว่า)
  AI_DAILY_LIMIT: 40,                // จำนวนครั้งที่ผู้ใช้ 1 คนเรียก AI ช่วยเขียน/ตรวจ ได้ต่อวัน
  AI_BATCH_SIZE: 15,                 // จำนวน Risk ที่ AI ตรวจต่อรอบอัตโนมัติ
  SCORE_THRESHOLD: 70                // คะแนน AI ต่ำกว่านี้ = ควรปรับปรุง
};

var DEFAULT_MODELS = {
  openai: 'gpt-4.1-mini',
  gemini: 'gemini-3.1-pro-preview',
  claude: 'claude-opus-5-5'
};

var API_KEY_PROPS = {
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  claude: 'ANTHROPIC_API_KEY'
};

/** คีย์ที่ ADMIN เปลี่ยนได้จากหน้า ตั้งค่า (เก็บในชีต Settings ของ DB) */
var EDITABLE_SETTINGS = ['ASSESSMENT_PERIOD', 'KRI_DUE_DAY', 'REMINDER_DAYS', 'MITIGATION_WARN_DAYS',
  'AI_PROVIDER', 'AI_MODEL', 'AI_EFFORT', 'AI_DAILY_LIMIT', 'AI_BATCH_SIZE', 'SCORE_THRESHOLD'];

var NUMERIC_SETTINGS = ['KRI_DUE_DAY', 'MITIGATION_WARN_DAYS', 'AI_DAILY_LIMIT', 'AI_BATCH_SIZE', 'SCORE_THRESHOLD'];

var TZ = 'Asia/Bangkok';

var configMemo_ = null; // memo ต่อ 1 execution

/** รวมค่าตั้ง (pure) — ใช้ใน getConfig_ และ unit test */
function mergeConfig_(props, overrides, now) {
  var cfg = {};
  Object.keys(DEFAULTS).forEach(function (k) { cfg[k] = DEFAULTS[k]; });
  Object.keys(props || {}).forEach(function (k) {
    if (k in DEFAULTS && props[k] !== '') cfg[k] = props[k];
  });
  EDITABLE_SETTINGS.forEach(function (k) {
    if (overrides && overrides[k] !== undefined && overrides[k] !== '') cfg[k] = overrides[k];
  });
  NUMERIC_SETTINGS.forEach(function (k) { cfg[k] = Number(cfg[k]); });
  cfg.AI_PROVIDER = String(cfg.AI_PROVIDER).toLowerCase();
  if (!cfg.AI_MODEL) cfg.AI_MODEL = DEFAULT_MODELS[cfg.AI_PROVIDER] || '';
  if (!cfg.ASSESSMENT_PERIOD) cfg.ASSESSMENT_PERIOD = String(isoDate_(now || new Date()).slice(0, 4));
  cfg.ASSESSMENT_PERIOD = String(cfg.ASSESSMENT_PERIOD);
  return cfg;
}

function getConfig_() {
  if (configMemo_) return configMemo_;
  var props = PropertiesService.getScriptProperties().getProperties();
  var overrides = {};
  if (props.DB_ID) {
    try { overrides = Db.readSettings(props.DB_ID); } catch (e) { console.warn('อ่าน Settings ไม่ได้: ' + e.message); }
  }
  configMemo_ = mergeConfig_(props, overrides);
  return configMemo_;
}

function resetConfigMemo_() { configMemo_ = null; }

function getApiKey_(provider) {
  var prop = API_KEY_PROPS[provider];
  if (!prop) throw new Error('ไม่รู้จัก AI provider: ' + provider);
  var key = PropertiesService.getScriptProperties().getProperty(prop);
  if (!key) throw new Error('ยังไม่ได้ตั้ง Script Property ' + prop);
  return key;
}
