/**
 * Schema — ชีตและคอลัมน์ของไฟล์ "Risk Register — DB"
 * คอลัมน์ของ Risks ไล่ตาม RISK_REGISTER ใน Sheet เดิม (RISK_REGISTER_TEMPLATE) เพื่อ export กลับได้ตรงรูปแบบ
 */

var SHEETS = {
  Users: ['Email', 'Name', 'Role', 'Departments', 'Is_Active', 'Note'],
  Departments: ['Dept_Code', 'Dept_Name', 'Approver_Email', 'Is_Active', 'Description'],
  Risks: ['Risk_ID', 'Risk_No', 'Assessment_Period', 'Business_Unit', 'Risk_Type', 'Risk_Subtype',
    'Risk_Scenario', 'Risk_Cause', 'Consequences',
    'Inherent_Impact', 'Inherent_Impact_Rationale', 'Inherent_Likelihood', 'Inherent_Likelihood_Rationale',
    'Inherent_Score', 'Inherent_Level',
    'Existing_Control',
    'Residual_Impact', 'Residual_Impact_Rationale', 'Residual_Likelihood', 'Residual_Likelihood_Rationale',
    'Residual_Score', 'Residual_Level',
    'Mitigation_Plan', 'Mitigation_Due_Date', 'Mitigation_Status', 'Risk_Owner',
    'Assess_Mode', 'Review_Window', 'Incident_Count', 'Incident_Examples', 'Impact_Dimensions',
    'Status', 'Version', 'Created_By', 'Created_At', 'Updated_By', 'Updated_At'],
  KRIs: ['KRI_ID', 'Risk_ID', 'KRI_Type', 'KRI_Name', 'Unit', 'Frequency', 'Direction',
    'Amber_Threshold', 'Red_Threshold', 'Green_Text', 'Amber_Text', 'Red_Text', 'Owner_Email', 'Is_Active'],
  KRI_Values: ['KRI_ID', 'Period', 'Value', 'Status', 'Comment', 'Action_Taken', 'Entered_By', 'Entered_At',
    'AI_Result', 'AI_Feedback'],
  Approvals: ['Dept_Code', 'Assessment_Period', 'Status', 'Assessor', 'Assessed_At', 'Approver', 'Approved_At', 'Note'],
  Taxonomy: ['Risk_Type', 'L2_Domain', 'Risk_Subtype', 'Description_TH', 'Description_EN'],
  Scale_Definitions: ['Dimension', 'Level', 'Sub_Dimension', 'Label', 'Description'],
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
  'Mitigation_Plan', 'Mitigation_Due_Date', 'Mitigation_Status', 'Risk_Owner',
  'Assess_Mode', 'Review_Window', 'Incident_Count', 'Incident_Examples', 'Impact_Dimensions'];

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
  Existing_Control: 'Exiting control — มาตรการควบคุมที่ทำอยู่จริง (Preventive / Detective / Corrective)',
  Residual_Impact: 'Residual Impact', Residual_Impact_Rationale: 'Residual Impact Rationale',
  Residual_Likelihood: 'Residual Likelihood', Residual_Likelihood_Rationale: 'Residual Likelihood Rationale',
  Mitigation_Plan: 'Mitigation plan — แผนลดความเสี่ยงเพิ่มเติม',
  Mitigation_Due_Date: 'Mitigation plan due date', Mitigation_Status: 'สถานะแผน', Risk_Owner: 'Risk Owner',
  Assess_Mode: 'โหมดการประเมิน', Review_Window: 'ช่วงเวลาที่ทบทวน',
  Incident_Count: 'เหตุการณ์จริง / near miss ในช่วงนี้ (จำนวนครั้ง)',
  Incident_Examples: 'ตัวอย่างเหตุการณ์ 1–2 เคส / ข้อมูลประกอบความถี่',
  Impact_Dimensions: 'มิติที่ได้รับผลกระทบ'
};

var ROLES = ['ADMIN', 'EDITOR', 'VIEWER'];
var ASSESS_MODES = ['New Risk', 'Reassessment'];
var REVIEW_WINDOWS = ['ไตรมาสล่าสุด', '6 เดือน', '1 ปี'];
/** 5 มิติผลกระทบตามเกณฑ์บริษัท — Impact = คะแนนสูงสุดของมิติที่กระทบจริง */
var IMPACT_DIMENSIONS = ['Financial', 'Legal & Compliance', 'Reputation', 'Operations', 'ESG'];
var DISCLAIMER = '@@คำอธิบายตัวอย่างนี้ขอให้ท่านนำไปพิจารณาเป็นแนวทางในการกรอก Risk Register หน่วยงานให้สอดคล้องกับเหตุการณ์ความเสี่ยงของท่าน เท่านั้น@@ ' +
  '— เป็นคำแนะนำเชิงแนวปฏิบัติ (good practice) ไม่ใช่คำปรึกษากฎหมาย ให้ปรับใช้ตามกฎหมาย/ข้อกำหนดในประเทศไทยและนโยบายภายในของบริษัท';
var KRI_TYPES = ['Leading', 'Lagging'];
var FREQUENCIES = ['Monthly', 'Quarterly'];
var DIRECTIONS = ['Higher_Worse', 'Lower_Worse', 'Qualitative'];
var MITIGATION_STATUSES = ['Not Started', 'In Progress', 'Done', 'Delayed'];
var APPROVAL_STATUSES = ['Draft', 'Submitted', 'Approved', 'Returned'];
var RAG = ['Green', 'Amber', 'Red'];

/** ระดับความเสี่ยงตามเกณฑ์บริษัท (คะแนน = Impact × Likelihood) */
var RISK_LEVELS = [
  { key: 'Low', name: 'Low Risk', min: 1, max: 6, mitigation: 'ใช้มาตรการควบคุมตามปกติในกระบวนการดำเนินงาน', reporting: 'Working group' },
  { key: 'Medium', name: 'Medium Risk', min: 7, max: 11, mitigation: 'ใช้มาตรการควบคุมภายในปกติ', reporting: 'CEO & MD' },
  { key: 'High', name: 'High Risk', min: 12, max: 19, mitigation: 'จัดทำแผนลดระดับความเสี่ยงให้อยู่ในระดับปานกลางหรือต่ำ สอดคล้องกับทิศทางและแผนธุรกิจ', reporting: 'RMC' },
  { key: 'Very High', name: 'Very High Risk', min: 20, max: 25, mitigation: 'จัดทำแผนการดำเนินการเพื่อลดระดับความเสี่ยงให้อยู่ในระดับปานกลางหรือต่ำ', reporting: 'RMC & BOD' }
];

/** 23 หน่วยงานตาม instruction ของบริษัท — setup() เพิ่มให้ถ้ายังไม่มี; อีเมลผู้อนุมัติและคำอธิบายหน้าที่ ADMIN เติมภายหลัง */
var DEPARTMENT_SEED = [
  ['CXM', 'CXM'],
  ['IBD', 'IBD'],
  ['TPC', 'TPC (Thailand Privilege Card)'],
  ['PMKT', 'Performance Marketing'],
  ['SALESCS', 'Sales & CS'],
  ['SUNBEAM', 'Sunbeam'],
  ['VM', 'VM (Value Management)'],
  ['ACCFIN', 'Accounting & Finance'],
  ['EXEC', 'Executive Office (Investor Relations)'],
  ['IT', 'Information Technology'],
  ['LEGAL', 'Legal'],
  ['PEOPLE', 'People'],
  ['PUR', 'Purchasing'],
  ['AIR711', 'Airport & 7-11 Media'],
  ['BBOPS', 'Billboard – Operation'],
  ['BBP', 'Billboard – Production'],
  ['BDA', 'Business Development & Asset'],
  ['DIGPROD', 'Digital – Production'],
  ['STOPS', 'Street – Operation Support'],
  ['OI', 'Operational Intelligence'],
  ['SBTAX', 'Signboard Tax'],
  ['STBUS', 'Street – Bus'],
  ['STSTAT', 'Street – Static']
];
/** รหัสจาก seed รุ่นก่อน (15 หน่วยงาน) ที่ไม่อยู่ในรายการใหม่ — setup() ปิดให้ถ้ายังไม่มี Risk */
var RETIRED_DEPT_CODES = ['DM', 'SALES', 'TPCIBD'];

var LEVEL_LABELS = { 1: 'ต่ำมาก', 2: 'ต่ำ', 3: 'ปานกลาง', 4: 'สูง', 5: 'สูงมาก' };

/** นิยามระดับตามเกณฑ์ Risk Impact & Likelihood ของบริษัท — แถว: [Dimension, Level, Sub_Dimension, Label, Description] */
function scaleSeed_() {
  var impact = {
    'Financial': {
      1: 'สูญเสียหรือค่าใช้จ่ายต่ำกว่า 1% ของกำไร',
      2: 'สูญเสียหรือค่าใช้จ่ายตั้งแต่ 1%–5% ของกำไร',
      3: 'สูญเสีย/ค่าใช้จ่ายตั้งแต่ 5%–10% ของกำไร',
      4: 'สูญเสีย/ค่าใช้จ่ายตั้งแต่ 10%–15% ของกำไร',
      5: 'สูญเสีย/ค่าใช้จ่ายตั้งแต่ 15% ของกำไรขึ้นไป'
    },
    'Legal & Compliance': {
      1: 'ผิดระเบียบภายใน/ขั้นตอนงานที่ไม่มีผลกระทบต่อกฎหมาย',
      2: 'ได้รับหนังสือตักเตือนจากหน่วยงานรัฐ หรือตรวจพบข้อบกพร่องจากการ Audit แต่ยังไม่มีโทษปรับทางแพ่งหรืออาญา',
      3: 'เกิดคดีความ/ค่าปรับ หรือมีคำสั่งจากหน่วยงานกำกับดูแลให้แก้ไขการดำเนินงานอย่างเป็นทางการ',
      4: 'ถูกสอบสวน/ตรวจเชิงลึกอย่างเป็นทางการ มีคดีความหรือข้อพิพาทสำคัญที่อาจทำให้ถูกระงับการดำเนินกิจกรรมบางประเภท กระทบสัญญากับลูกค้ารายใหญ่ หรือมีการระงับการซื้อขายหุ้นของบริษัทชั่วคราว',
      5: 'บทลงโทษรุนแรงขั้นสูงสุด เช่น ถูกสั่งเพิกถอนหลักทรัพย์จากการเป็นหลักทรัพย์จดทะเบียน หรือถูกฟ้องร้องคดีใหญ่ที่กระทบความมั่นคงของบริษัท'
    },
    'Reputation': {
      1: 'เป็นข้อร้องเรียนจากลูกค้า/คู่ค้าในวงจำกัด ภายในบริษัท',
      2: 'มีการกล่าวถึงเชิงลบแบบจำกัด (เช่น โพสต์ใน Social Network ส่วนตัววงจำกัด)',
      3: 'เกิดกระแสวิจารณ์เชิงลบใน Social Media แบบสาธารณะ (Facebook, TikTok, Instagram) มี Reaction/Comment แนว Viral พาดพิงบริษัท อยู่ในกระแสไม่เกิน 3 วัน',
      4: 'ถูกนำเสนอเป็นข่าวในสำนักข่าวออนไลน์/เว็บข่าว/เพจข่าวหลัก เกิดการรับรู้เชิงลบวงกว้าง มีประเด็นต่อเนื่องมากกว่า 3 วัน',
      5: 'เป็นข่าวใหญ่/กระแสลบชัดเจนทั้งสื่อ Offline และ Online (สำนักข่าวออนไลน์ โทรทัศน์ หนังสือพิมพ์) ต่อเนื่องมากกว่า 3 วัน หรือถูกหยิบกลับมานำเสนอซ้ำ'
    },
    'Operations': {
      1: 'สะดุดเล็กน้อยมากเฉพาะจุดย่อย/หน่วยงานเดียว ไม่มีงานค้างหรือเคลียร์ได้ภายในวันทำการเดียว แก้ไขตามปกติ (BAU)',
      2: 'งานล่าช้า/ติดขัดเล็กน้อยเฉพาะบางหน่วยงาน/พื้นที่/กระบวนการ งานค้างไม่เกิน 1 วันทำการ เคลียร์ได้ด้วยการทำงานล่วงเวลา',
      3: 'กระทบงานหลัก/การให้บริการบางส่วน ต้องจัดการเร่งด่วน งานค้างเริ่มสะสม ต้องใช้ workaround',
      4: 'กระทบงานหลักหลายส่วน/หลายพื้นที่ จนกระทบการให้บริการชัดเจน งานค้างสะสมจำนวนมาก (มากกว่า 3 วันทำการ)',
      5: 'การปฏิบัติงานหยุดชะงักระดับองค์กร ไม่สามารถดำเนินงานหลักได้ งานค้างสะสมหนักมาก กู้คืนได้แต่ใช้เวลานานและทรัพยากรจำนวนมาก'
    },
    'ESG': {
      1: 'เกิดเฉพาะจุดภายในหน่วยงาน ไม่มีผลกระทบต่อชุมชน/สิ่งแวดล้อมอย่างมีนัย ผู้ได้รับผลกระทบเป็นพนักงาน 1–2 คนหรือเคสเล็กน้อย',
      2: 'กระทบ 1 ใน 3 ด้านของ ESG ในวงจำกัด ผู้ได้รับผลกระทบเป็นพนักงานกลุ่มเล็กหรือชุมชนใกล้จุดปฏิบัติงานเป็นครั้งคราว',
      3: 'กระทบ 1 ใน 3 ด้านของ ESG ผู้ได้รับผลกระทบเป็นผู้มีส่วนได้ส่วนเสียบางกลุ่ม (ชุมชน คู่ค้า พนักงาน)',
      4: 'กระทบ 2 ใน 3 ด้านของ ESG ผู้ได้รับผลกระทบหลายกลุ่ม (ชุมชน พนักงาน คู่ค้า ลูกค้า ผู้ให้เช่า หน่วยงานกำกับดูแลและภาครัฐ)',
      5: 'กระทบทุกด้านของ ESG และผู้มีส่วนได้ส่วนเสียวงกว้างทุกกลุ่ม (ผู้ถือหุ้น/ผู้ลงทุน หน่วยงานกำกับดูแล ภาครัฐ ลูกค้า คู่ค้า ชุมชน ผู้ให้เช่า พนักงาน)'
    }
  };
  var likelihood = {
    1: 'ไม่น่าเกิดขึ้นภายใน 3 ปี | โอกาสเกิดในปีนี้ < 20%',
    2: 'เกิดขึ้น 1 ครั้งในรอบ 1–3 ปี | โอกาสเกิดในปีนี้ 20%–40%',
    3: 'เกิดขึ้น 1 ครั้งในรอบ 1 ปี | โอกาสเกิดในปีนี้ 40%–60%',
    4: 'เกิดขึ้น 4 ครั้งในรอบ 1 ปี หรือทุกไตรมาส | โอกาสเกิดในปีนี้ 60%–80%',
    5: 'เกิดขึ้น 12 ครั้งในรอบ 1 ปี หรือทุกเดือน | โอกาสเกิดในปีนี้ > 80%'
  };
  var rows = [];
  [1, 2, 3, 4, 5].forEach(function (l) {
    IMPACT_DIMENSIONS.forEach(function (d) { rows.push(['Impact', l, d, LEVEL_LABELS[l], impact[d][l]]); });
  });
  [1, 2, 3, 4, 5].forEach(function (l) { rows.push(['Likelihood', l, '', LEVEL_LABELS[l], likelihood[l]]); });
  return rows;
}

/** ข้อความนิยามแบบทั่วไปของรุ่นแรก — setup() ใช้ตรวจว่ายังไม่ได้แก้เอง จึงแทนด้วยเกณฑ์บริษัทได้ */
var OLD_SCALE_SEED_PREFIXES = ['ผลกระทบน้อยมาก แก้ไขได้ทันที', 'ผลกระทบเล็กน้อย กระทบงานภายใน', 'ผลกระทบปานกลาง กระทบลูกค้า',
  'ผลกระทบสูง กระทบรายได้', 'ผลกระทบรุนแรงมาก กระทบความต่อเนื่อง', 'แทบจะไม่เกิด (น้อยกว่า', 'อาจเกิดได้แต่ไม่บ่อย',
  'อาจเกิดขึ้นได้ (ประมาณปีละ', 'มีโอกาสเกิดสูง (หลายครั้งต่อปี)', 'เกิดขึ้นเกือบแน่นอน'];
