// ข้อมูลสมมติสำหรับทดสอบ / รันในเครื่อง (MEMORY_DB=1)
let row = 1;
const R = (o) => Object.assign({ _row: ++row }, o);
const lvl = (s) => (s <= 6 ? 'Low' : s <= 11 ? 'Medium' : s <= 19 ? 'High' : 'Very High');
function risk(id, bu, type, sub, scen, ii, il, ri, rl, extra) {
  return R(Object.assign({
    Risk_ID: id, Risk_No: Number(id.slice(-3)), Assessment_Period: '2026', Business_Unit: bu, Risk_Type: type, Risk_Subtype: sub,
    Risk_Scenario: scen, Risk_Cause: 'สาเหตุหลักของ ' + id, Consequences: 'ผลกระทบด้านรายได้และชื่อเสียง',
    Inherent_Impact: ii, Inherent_Impact_Rationale: 'เหตุผล impact', Inherent_Likelihood: il, Inherent_Likelihood_Rationale: 'เหตุผล likelihood',
    Inherent_Score: ii * il, Inherent_Level: lvl(ii * il), Existing_Control: 'Preventive: ตรวจสภาพก่อนใช้งานทุกเดือน (ทีมซ่อมบำรุง, checklist)\nDetective: ระบบแจ้งเตือนอัตโนมัติ',
    Residual_Impact: ri, Residual_Impact_Rationale: 'เหตุผล', Residual_Likelihood: rl, Residual_Likelihood_Rationale: 'เหตุผล',
    Residual_Score: ri * rl, Residual_Level: lvl(ri * rl), Mitigation_Plan: '', Mitigation_Due_Date: '', Mitigation_Status: '',
    Risk_Owner: 'ผู้จัดการฝ่าย', Status: 'Active', Version: 2, Created_By: 'editor@co.th', Created_At: '2026-07-01T09:00:00',
    Updated_By: 'editor@co.th', Updated_At: '2026-09-20T14:30:00'
  }, extra || {}));
}
const kri = (id, rid, type, name, unit, freq, dir, a, r, extra) => R(Object.assign({ KRI_ID: id, Risk_ID: rid, KRI_Type: type, KRI_Name: name, Unit: unit,
  Frequency: freq, Direction: dir, Amber_Threshold: a, Red_Threshold: r, Green_Text: '', Amber_Text: '', Red_Text: '', Owner_Email: '', Is_Active: 'TRUE' }, extra || {}));
const val = (id, p, v, s, c) => R({ KRI_ID: id, Period: p, Value: v, Status: s, Comment: c || '', Action_Taken: '', Entered_By: 'editor@co.th', Entered_At: '2026-09-05T10:00:00', AI_Result: '', AI_Feedback: '' });

module.exports = {
  Users: [
    R({ Email: 'admin@co.th', Name: 'Risk Admin', Role: 'ADMIN', Departments: '*', Is_Active: 'TRUE' }),
    R({ Email: 'editor@co.th', Name: 'Ops Editor', Role: 'EDITOR', Departments: 'OPS', Is_Active: 'TRUE' }),
    R({ Email: 'viewer@co.th', Name: 'Fin Viewer', Role: 'VIEWER', Departments: 'FIN', Is_Active: 'TRUE' })
  ],
  Departments: [
    R({ Dept_Code: 'OPS', Dept_Name: 'Operations & Maintenance', Approver_Email: 'coo@co.th', Is_Active: 'TRUE' }),
    R({ Dept_Code: 'FIN', Dept_Name: 'Finance', Approver_Email: 'cfo@co.th', Is_Active: 'TRUE' }),
    R({ Dept_Code: 'HR', Dept_Name: 'Human Resources', Approver_Email: '', Is_Active: 'TRUE' })
  ],
  Taxonomy: [
    ['ESG risk', 'Environmental', 'Physical climate / natural hazards', 'ความเสี่ยงจากภัยธรรมชาติ/สภาพอากาศสุดขั้ว ที่กระทบพื้นที่ติดตั้งสื่อ'],
    ['ESG risk', 'Environmental', 'Waste & e-waste', 'ความเสี่ยงด้านการจัดการของเสียและซากอุปกรณ์'],
    ['ESG risk', 'Governance', 'Ethics & anti-corruption', 'ความเสี่ยงด้านจริยธรรมและการต่อต้านทุจริต'],
    ['ESG risk', 'Social', 'Occupational health & safety (OHS)', 'ความเสี่ยงอาชีวอนามัยและความปลอดภัยในการทำงาน'],
    ['Operational risk', 'Operations', 'Asset maintenance & uptime', 'ความพร้อมใช้งานของจอ/ป้าย และการซ่อมบำรุง'],
    ['Operational Risk', 'Technology', 'IT system outage', 'ระบบ IT/CMS ล่ม'],
    ['Financial risk', 'Liquidity', 'Cash flow & collection', 'การเก็บเงินลูกหนี้และสภาพคล่อง'],
    ['Strategic risk', 'Market', 'Competition & pricing', 'การแข่งขันและราคา']
  ].map((t) => R({ Risk_Type: t[0], L2_Domain: t[1], Risk_Subtype: t[2], Description_TH: t[3], Description_EN: '' })),
  Scale_Definitions: (() => {
    const load = require('../../tests/load.js');
    return load().scaleSeed_().map((r) => R({ Dimension: r[0], Level: r[1], Sub_Dimension: r[2], Label: r[3], Description: r[4] }));
  })(),
  Risks: [
    risk('OPS-R-001', 'OPS', 'Operational risk', 'Asset maintenance & uptime', 'จอ LED ดับในช่วงฝนตกหนัก ทำให้ออกอากาศไม่ครบตามสัญญา', 5, 4, 4, 4,
      { Mitigation_Plan: 'ติดตั้งซีลกันน้ำใหม่ทุกจอ', Mitigation_Due_Date: '2026-09-30', Mitigation_Status: 'In Progress' }),
    risk('OPS-R-002', 'OPS', 'ESG risk', 'Occupational health & safety (OHS)', 'ช่างติดตั้งตกจากที่สูงระหว่างติดตั้งป้าย', 5, 3, 4, 2,
      { Mitigation_Plan: 'อบรม Work at height และตรวจอุปกรณ์ก่อนขึ้นงาน', Mitigation_Due_Date: '2026-11-15', Mitigation_Status: 'Not Started' }),
    risk('OPS-R-003', 'OPS', 'Operational Risk', 'IT system outage', 'ระบบ CMS ล่มทำให้เปลี่ยนคอนเทนต์บนจอไม่ได้', 3, 3, 2, 2),
    risk('FIN-R-001', 'FIN', 'Financial risk', 'Cash flow & collection', 'ลูกหนี้รายใหญ่ค้างชำระเกิน 90 วัน', 4, 3, 3, 3,
      { Mitigation_Plan: 'ติดตามลูกหนี้รายสัปดาห์', Mitigation_Due_Date: '2026-12-31', Mitigation_Status: 'In Progress' }),
    risk('HR-R-001', 'HR', 'ESG risk', 'Ethics & anti-corruption', 'พนักงานรับผลประโยชน์จากผู้ขายในการคัดเลือกพื้นที่', 4, 2, 3, 2)
  ],
  KRIs: [
    kri('OPS-R-001-K1', 'OPS-R-001', 'Leading', 'จำนวนจอที่ตรวจซีลกันน้ำแล้ว', '%', 'Monthly', 'Lower_Worse', 90, 80),
    kri('OPS-R-001-K2', 'OPS-R-001', 'Lagging', 'ชั่วโมงจอดับสะสม', 'ชม.', 'Monthly', 'Higher_Worse', 10, 24),
    kri('OPS-R-002-K1', 'OPS-R-002', 'Lagging', 'อุบัติเหตุจากการทำงานบนที่สูง', 'ครั้ง', 'Quarterly', 'Higher_Worse', 1, 2),
    kri('OPS-R-003-K1', 'OPS-R-003', 'Leading', 'ผลการทดสอบ DR', '', 'Quarterly', 'Qualitative', '', '', { Green_Text: 'ผ่านทุกข้อ', Amber_Text: 'ผ่านบางข้อ', Red_Text: 'ไม่ผ่าน' }),
    kri('FIN-R-001-K1', 'FIN-R-001', 'Leading', 'ลูกหนี้เกิน 60 วัน', 'ล้านบาท', 'Monthly', 'Higher_Worse', 5, 10),
    kri('HR-R-001-K1', 'HR-R-001', 'Lagging', 'ข้อร้องเรียนด้านจริยธรรม', 'เรื่อง', 'Quarterly', 'Higher_Worse', 1, 3)
  ],
  KRI_Values: [
    val('OPS-R-001-K1', '2026-07', 95, 'Green'), val('OPS-R-001-K1', '2026-08', 88, 'Amber', 'ทีมไม่พอ'), val('OPS-R-001-K1', '2026-09', 78, 'Red', 'ฝนตกหนักจนเข้าพื้นที่ไม่ได้'),
    val('OPS-R-001-K2', '2026-07', 6, 'Green'), val('OPS-R-001-K2', '2026-08', 14, 'Amber', 'จอดับ 3 จุด'),
    val('OPS-R-002-K1', '2026-Q2', 0, 'Green'),
    val('FIN-R-001-K1', '2026-08', 4, 'Green'), val('FIN-R-001-K1', '2026-09', 7, 'Amber', 'ลูกค้า A จ่ายช้า'),
    val('HR-R-001-K1', '2026-Q3', 0, 'Green')
  ],
  Approvals: [R({ Dept_Code: 'FIN', Assessment_Period: '2026', Status: 'Submitted', Assessor: 'fin.editor@co.th', Assessed_At: '2026-10-01T10:00:00', Approver: '', Approved_At: '', Note: '' })],
  AI_Reviews: [
    R({ Risk_ID: 'OPS-R-001', Hash: 'x', Score: 65, Grade: 'C', Summary: 'เหตุผลระดับความเสี่ยงยังไม่มีสถิติ', Criteria_JSON: '[]', Issues_JSON: '[]', Improved_JSON: '{}', Reviewed_At: '2026-10-01T08:00:00', Model: 'm' }),
    R({ Risk_ID: 'OPS-R-003', Hash: 'y', Score: 90, Grade: 'A', Summary: 'ครบถ้วน', Criteria_JSON: '[]', Issues_JSON: '[]', Improved_JSON: '{}', Reviewed_At: '2026-10-01T08:00:00', Model: 'm' })
  ],
  AI_Criteria: [], AI_Runs: [],
  Settings: [R({ Key: 'ASSESSMENT_PERIOD', Value: '2026' })],
  Audit_Log: []
};
