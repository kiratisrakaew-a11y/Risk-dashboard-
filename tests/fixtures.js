// ข้อมูลสมมติ 2 แผนก (FIN, HR) — ใช้ทดสอบว่าข้อมูลไม่รั่วข้ามแผนก
module.exports = function fixtures(G) {
  const risk = (id, bu, ii, il, ri, rl, extra) => Object.assign(G.normalizeRisk_(Object.assign({
    Risk_Type: 'ESG risk', Risk_Subtype: 'Waste & e-waste', Risk_Scenario: 'scenario ' + id, Risk_Cause: 'c', Consequences: 'q',
    Inherent_Impact: ii, Inherent_Likelihood: il, Residual_Impact: ri, Residual_Likelihood: rl, Risk_Owner: 'o'
  }, extra || {})), { Risk_ID: id, Business_Unit: bu, Assessment_Period: '2026', Status: 'Active' });
  return {
    risks: [
      risk('FIN-R-001', 'FIN', 5, 5, 4, 4, { Mitigation_Plan: 'p1', Mitigation_Due_Date: '2026-10-01', Mitigation_Status: 'In Progress' }),
      risk('FIN-R-002', 'FIN', 3, 3, 2, 2, { Risk_Type: 'Operational risk', Mitigation_Plan: 'p2', Mitigation_Due_Date: '2026-11-01' }),
      risk('FIN-R-003', 'FIN', 2, 2, 1, 1, {}),
      Object.assign(risk('FIN-R-004', 'FIN', 5, 5, 5, 5, {}), { Status: 'Closed' }),
      Object.assign(risk('FIN-R-005', 'FIN', 5, 5, 5, 5, {}), { Assessment_Period: '2025' }),
      risk('HR-R-001', 'HR', 4, 5, 4, 5, { Mitigation_Plan: 'hp', Mitigation_Due_Date: '2026-09-01' })
    ],
    kris: [
      { KRI_ID: 'FIN-R-001-K1', Risk_ID: 'FIN-R-001', KRI_Type: 'Leading', KRI_Name: 'late', Frequency: 'Monthly', Direction: 'Higher_Worse', Amber_Threshold: 5, Red_Threshold: 10, Is_Active: 'TRUE' },
      { KRI_ID: 'FIN-R-001-K2', Risk_ID: 'FIN-R-001', KRI_Type: 'Lagging', KRI_Name: 'loss', Frequency: 'Quarterly', Direction: 'Higher_Worse', Amber_Threshold: 1, Red_Threshold: 3, Is_Active: 'TRUE' },
      { KRI_ID: 'FIN-R-002-K1', Risk_ID: 'FIN-R-002', KRI_Type: 'Leading', KRI_Name: 'uptime', Frequency: 'Monthly', Direction: 'Lower_Worse', Amber_Threshold: 99, Red_Threshold: 95, Is_Active: 'TRUE' },
      { KRI_ID: 'FIN-R-002-K9', Risk_ID: 'FIN-R-002', KRI_Type: 'Leading', KRI_Name: 'old', Frequency: 'Monthly', Direction: 'Qualitative', Is_Active: 'FALSE' },
      { KRI_ID: 'HR-R-001-K1', Risk_ID: 'HR-R-001', KRI_Type: 'Leading', KRI_Name: 'turnover', Frequency: 'Monthly', Direction: 'Higher_Worse', Amber_Threshold: 3, Red_Threshold: 5, Is_Active: 'TRUE' }
    ],
    values: [
      { KRI_ID: 'FIN-R-001-K1', Period: '2026-09', Value: '12', Status: 'Red' },
      { KRI_ID: 'FIN-R-001-K1', Period: '2026-08', Value: '6', Status: 'Amber' },
      { KRI_ID: 'FIN-R-001-K2', Period: '2026-Q2', Value: '0', Status: 'Green' },
      { KRI_ID: 'FIN-R-002-K1', Period: '2026-08', Value: '99.5', Status: 'Green' },
      { KRI_ID: 'HR-R-001-K1', Period: '2026-09', Value: '9', Status: 'Red' }
    ],
    depts: [{ Dept_Code: 'FIN', Dept_Name: 'Finance' }, { Dept_Code: 'HR', Dept_Name: 'Human Resources' }],
    approvals: [{ Dept_Code: 'FIN', Assessment_Period: '2026', Status: 'Submitted' }],
    aiReviews: [{ Risk_ID: 'FIN-R-001', Score: '60' }, { Risk_ID: 'FIN-R-002', Score: '90' }, { Risk_ID: 'HR-R-001', Score: '10' }]
  };
};
