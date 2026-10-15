/**
 * Schema — ชีตและคอลัมน์ของไฟล์ "Risk Register — DB"
 * คอลัมน์ของ Risks ไล่ตาม RISK_REGISTER ใน Sheet เดิม (RISK_REGISTER_TEMPLATE) เพื่อ export กลับได้ตรงรูปแบบ
 */

var SHEETS = {
  Users: ['Email', 'Name', 'Role', 'Departments', 'Is_Active', 'Note'],
  Departments: ['Dept_Code', 'Dept_Name', 'Approver_Email', 'Is_Active'],
  Risks: ['Risk_ID', 'Risk_No', 'Assessment_Period', 'Business_Unit', 'Risk_Type', 'Risk_Subtype',
    'Risk_Scenario', 'Risk_Cause', 'Consequences',
    'Inherent_Impact', 'Inherent_Impact_Rationale', 'Inherent_Likelihood', 'Inherent_Likelihood_Rationale',
    'Inherent_Score', 'Inherent_Level',
    'Existing_Control',
    'Residual_Impact', 'Residual_Impact_Rationale', 'Residual_Likelihood', 'Residual_Likelihood_Rationale',
    'Residual_Score', 'Residual_Level',
    'Mitigation_Plan', 'Mitigation_Due_Date', 'Mitigation_Status', 'Risk_Owner',
    'Status', 'Version', 'Created_By', 'Created_At', 'Updated_By', 'Updated_At'],
  KRIs: ['KRI_ID', 'Risk_ID', 'KRI_Type', 'KRI_Name', 'Unit', 'Frequency', 'Direction',
    'Amber_Threshold', 'Red_Threshold', 'Green_Text', 'Amber_Text', 'Red_Text', 'Owner_Email', 'Is_Active'],
  KRI_Values: ['KRI_ID', 'Period', 'Value', 'Status', 'Comment', 'Action_Taken', 'Entered_By', 'Entered_At',
    'AI_Result', 'AI_Feedback'],
  Approvals: ['Dept_Code', 'Assessment_Period', 'Status', 'Assessor', 'Assessed_At', 'Approver', 'Approved_At', 'Note'],
  Taxonomy: ['Risk_Type', 'L2_Domain', 'Risk_Subtype', 'Description_TH', 'Description_EN'],
  Scale_Definitions: ['Dimension', 'Level', 'Label', 'Description'],
  AI_Criteria: ['Scope', 'Criteria', 'Is_Active', 'Note'],
  AI_Reviews: ['Risk_ID', 'Hash', 'Provider', 'Model', 'Score', 'Grade', 'Summary', 'Criteria_JSON', 'Issues_JSON',
    'Improved_JSON', 'Tokens_In', 'Tokens_Out', 'Reviewed_At', 'Reviewed_By'],
  AI_Runs: ['Started_At', 'Finished_At', 'Provider', 'Model', 'Pending', 'Reviewed', 'Errors', 'Message'],
  Settings: ['Key', 'Value', 'Description'],
  Audit_Log: ['At', 'Email', 'Action', 'Entity', 'Entity_ID', 'Before_JSON', 'After_JSON']
};

/** ฟิลด์ของ Risk ที่ผู้ใช้กรอกเองได้ (ที่เหลือระบบเติม) */
var RISK_INPUT_FIELDS = ['Risk_Type', 'Risk_Subtype', 'Risk_Scenario', 'Risk_Cause', 'Consequences',
  'Inherent_Impact', 'Inherent_Impact_Rationale', 'Inherent_Likelihood', 'Inherent_Likelihood_Rationale',
  'Existing_Control',
  'Residual_Impact', 'Residual_Impact_Rationale', 'Residual_Likelihood', 'Residual_Likelihood_Rationale',
  'Mitigation_Plan', 'Mitigation_Due_Date', 'Mitigation_Status', 'Risk_Owner'];

var KRI_INPUT_FIELDS = ['KRI_ID', 'KRI_Type', 'KRI_Name', 'Unit', 'Frequency', 'Direction',
  'Amber_Threshold', 'Red_Threshold', 'Green_Text', 'Amber_Text', 'Red_Text', 'Owner_Email', 'Is_Active'];

/** ป้ายชื่อภาษาไทย/อังกฤษตาม Sheet เดิม (ใช้ในฟอร์ม, prompt AI และ export) */
var FIELD_LABELS = {
  Risk_Type: 'Risk Type', Risk_Subtype: 'Risk Sub-type',
  Risk_Scenario: 'Risk Scenario — คำอธิบายเหตุการณ์ความเสี่ยง',
  Risk_Cause: 'Risk cause — สาเหตุหลักที่ทำให้เกิดความเสี่ยง',
  Consequences: 'Consequences — ผลกระทบที่จะได้รับ',
  Inherent_Impact: 'Inherent Impact', Inherent_Impact_Rationale: 'Inherent Impact Rationale',
  Inherent_Likelihood: 'Inherent Likelihood', Inherent_Likelihood_Rationale: 'Inherent Likelihood Rationale',
  Existing_Control: 'Existing control — มาตรการควบคุมที่ใช้อยู่แล้ว',
  Residual_Impact: 'Residual Impact', Residual_Impact_Rationale: 'Residual Impact Rationale',
  Residual_Likelihood: 'Residual Likelihood', Residual_Likelihood_Rationale: 'Residual Likelihood Rationale',
  Mitigation_Plan: 'Mitigation plan — แผนลดความเสี่ยงเพิ่มเติม',
  Mitigation_Due_Date: 'Mitigation plan due date', Mitigation_Status: 'สถานะแผน', Risk_Owner: 'Risk Owner'
};

var ROLES = ['ADMIN', 'EDITOR', 'VIEWER'];
var KRI_TYPES = ['Leading', 'Lagging'];
var FREQUENCIES = ['Monthly', 'Quarterly'];
var DIRECTIONS = ['Higher_Worse', 'Lower_Worse', 'Qualitative'];
var MITIGATION_STATUSES = ['Not Started', 'In Progress', 'Done', 'Delayed'];
var APPROVAL_STATUSES = ['Draft', 'Submitted', 'Approved', 'Returned'];
var RAG = ['Green', 'Amber', 'Red'];

/** ระดับความเสี่ยงตามชีต MATRIX ของ Sheet เดิม */
var RISK_LEVELS = [
  { key: 'Low', name: 'Low Risk', min: 1, max: 6, mitigation: 'Existing Standard Controls', reporting: 'Working group' },
  { key: 'Moderate', name: 'Moderate Risk', min: 7, max: 11, mitigation: 'Enhanced Monitoring and Existing Standard Controls', reporting: 'CEO & MD' },
  { key: 'High', name: 'High Risk', min: 12, max: 19, mitigation: 'Additional Mitigation required', reporting: 'RMC' },
  { key: 'Very High', name: 'Very High Risk', min: 20, max: 25, mitigation: 'Additional Mitigation required', reporting: 'RMC & BOD' }
];

/** หน่วยงานตาม "Risk report Log" (15 หน่วยงาน) — setup() ใส่ให้ถ้าชีต Departments ยังว่าง; อีเมลผู้อนุมัติ ADMIN เติมภายหลัง */
var DEPARTMENT_SEED = [
  ['DM', 'Digital Media'],
  ['BBP', 'Billboard Production'],
  ['VM', 'Value Management'],
  ['AIR711', 'Airport & Seven-Eleven Media'],
  ['STBUS', 'Street-Bus'],
  ['OI', 'Operation Intelligence'],
  ['STOPS', 'Street - Operation Support'],
  ['PMKT', 'Performance Marketing'],
  ['LEGAL', 'Legal'],
  ['SALES', 'Sales'],
  ['PUR', 'Purchasing'],
  ['PEOPLE', 'People'],
  ['SBTAX', 'Signboard Tax'],
  ['TPCIBD', 'THAILAND PRIVILEGE CARD & IBD'],
  ['STSTAT', 'Street Static']
];

var LEVEL_LABELS = { 1: 'ต่ำมาก', 2: 'ต่ำ', 3: 'ปานกลาง', 4: 'สูง', 5: 'สูงมาก' };

/** คำอธิบายระดับตั้งต้น — ADMIN ควรแก้ในชีต Scale_Definitions ให้ตรงกับชีต "Impact & Likelihood" ของบริษัท */
function scaleSeed_() {
  var impact = {
    1: 'ผลกระทบน้อยมาก แก้ไขได้ทันทีในระดับปฏิบัติงาน ไม่กระทบลูกค้า/การเงินอย่างมีนัยสำคัญ',
    2: 'ผลกระทบเล็กน้อย กระทบงานภายในหน่วยงาน แก้ไขได้ภายในไม่กี่วัน',
    3: 'ผลกระทบปานกลาง กระทบลูกค้า/รายได้บางส่วน ต้องใช้ผู้บริหารระดับฝ่ายจัดการ',
    4: 'ผลกระทบสูง กระทบรายได้/ชื่อเสียง/กฎหมายอย่างมีนัยสำคัญ ต้องรายงานผู้บริหารระดับสูง',
    5: 'ผลกระทบรุนแรงมาก กระทบความต่อเนื่องทางธุรกิจ ชื่อเสียงระดับประเทศ หรือถูกลงโทษตามกฎหมาย'
  };
  var likelihood = {
    1: 'แทบจะไม่เกิด (น้อยกว่า 1 ครั้งใน 5 ปี)',
    2: 'อาจเกิดได้แต่ไม่บ่อย (1 ครั้งใน 2–5 ปี)',
    3: 'อาจเกิดขึ้นได้ (ประมาณปีละ 1 ครั้ง)',
    4: 'มีโอกาสเกิดสูง (หลายครั้งต่อปี)',
    5: 'เกิดขึ้นเกือบแน่นอน (ทุกเดือนหรือบ่อยกว่า)'
  };
  var rows = [];
  [1, 2, 3, 4, 5].forEach(function (l) { rows.push(['Impact', l, LEVEL_LABELS[l], impact[l]]); });
  [1, 2, 3, 4, 5].forEach(function (l) { rows.push(['Likelihood', l, LEVEL_LABELS[l], likelihood[l]]); });
  return rows;
}
