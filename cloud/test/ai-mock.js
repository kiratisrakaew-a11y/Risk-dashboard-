// AI จำลองสำหรับทดสอบหน้าเว็บในเครื่อง (โหลดเมื่อ DEV_EXTRA_GS ชี้มาที่ไฟล์นี้ — ห้ามใช้บน Cloud Run)
AiProvider = { callJson: function (req) {
  var data;
  if (req.schemaName === 'risk_draft') data = {
    risk_scenario: 'จอ LED ป้ายริมถนนดับต่อเนื่องเกิน 4 ชั่วโมงในช่วงฝนตกหนัก ทำให้ไม่สามารถออกอากาศโฆษณาตามสัญญาได้',
    risk_cause: 'น้ำฝนซึมเข้าตู้ควบคุมไฟฟ้า ซีลกันน้ำเสื่อมสภาพ และไม่มีการตรวจสภาพก่อนเข้าฤดูฝน',
    consequences: 'ต้องชดเชยเวลาออกอากาศ/คืนเงินลูกค้า [ระบุจำนวนเงิน], ความเชื่อมั่นลูกค้าลดลง',
    risk_type: 'Operational risk', risk_subtype: 'Asset maintenance & uptime',
    inherent_impact: 4, inherent_impact_rationale: 'กระทบรายได้และสัญญาลูกค้าหลายราย', inherent_likelihood: 4, inherent_likelihood_rationale: 'เกิดหลายครั้งต่อปีในฤดูฝน',
    control_preventive: 'ตรวจซีลกันน้ำตู้ควบคุมก่อนฤดูฝน [ระบุ: ใครทำ / ความถี่ / หลักฐาน]', control_detective: 'ระบบแจ้งเตือนจอดับอัตโนมัติ (NOC, log)', control_corrective: 'ทีมซ่อมบำรุงเวร 24 ชม. (ticket)',
    questions: ['ในปีที่ผ่านมาจอดับกี่ครั้ง และชดเชยลูกค้าเท่าไร?'],
    residual_impact: 3, residual_impact_rationale: 'ซ่อมได้ภายในวันเดียวกัน', residual_likelihood: 3, residual_likelihood_rationale: 'มีการแจ้งเตือนทันที',
    mitigation_plan: 'ผู้จัดการฝ่ายซ่อมบำรุงจัดตรวจซีลกันน้ำทุกจอก่อนฤดูฝน ภายใน 30 เม.ย. 2027',
    notes: 'ตรวจจำนวนเงินชดเชยจริงจากฝ่ายขาย',
    kris: [
      { kri_type: 'Leading', kri_name: 'จำนวนจอที่ตรวจซีลกันน้ำแล้ว', unit: '%', frequency: 'Monthly', direction: 'Lower_Worse', amber_threshold: 90, red_threshold: 80, green_text: '', amber_text: '', red_text: '' },
      { kri_type: 'Lagging', kri_name: 'ชั่วโมงจอดับสะสม', unit: 'ชม./เดือน', frequency: 'Monthly', direction: 'Higher_Worse', amber_threshold: 10, red_threshold: 24, green_text: '', amber_text: '', red_text: '' }
    ] };
  else if (req.schemaName === 'risk_classify') data = { candidates: [
    { risk_type: 'Operational risk', risk_subtype: 'Asset maintenance & uptime', confidence: 'high', reason: 'เหตุการณ์จอดับกระทบความพร้อมใช้งานของสื่อโดยตรง' },
    { risk_type: 'ESG risk', risk_subtype: 'Physical climate / natural hazards', confidence: 'medium', reason: 'สาเหตุมาจากฝนตกหนัก (สภาพอากาศ)' },
    { risk_type: 'Fake', risk_subtype: 'Not real', confidence: 'high', reason: 'ต้องถูกกรองทิ้ง' } ] };
  else if (req.schemaName === 'risk_score_inherent') data = { status: 'scored', questions: [], guidance: '', assumed_scenario: 'จอดับพร้อมกันหลายจุดช่วงพายุ ไม่มีระบบแจ้งเตือน',
    impact_by_dimension: { financial: 3, legal: 0, reputation: 4, operations: 3, esg: 0 }, impact_reason: 'ข่าวออนไลน์ (Reputation 4)', likelihood: 5, likelihood_reason: 'เกิดทุกเดือนในฤดูฝน', confidence: 'medium', missing_info: '' };
  else if (req.schemaName === 'risk_score_residual') data = { status: 'scored', questions: [], guidance: 'Residual ยังสูงกว่า Medium ต้องทำแผนลด Likelihood',
    impact_by_dimension: { financial: 2, legal: 0, reputation: 3, operations: 2, esg: 0 }, impact_reason: 'ตรวจพบเร็ว จำกัดความเสียหาย', likelihood: 4, likelihood_reason: 'เกิดจริง 4 ครั้ง/ปี',
    confidence: 'medium', missing_info: 'มูลค่าชดเชย',
    control_assessment: [{ control_type: 'Preventive', control: 'ตรวจสภาพทุกเดือน', effect: 'reduce_likelihood', effectiveness: 'partial', note: 'ไม่มีหลักฐาน checklist' },
      { control_type: 'Detective', control: 'ระบบแจ้งเตือน', effect: 'reduce_impact', effectiveness: 'effective', note: '' }] };
  else if (req.schemaName === 'improve_field') data = { text: 'ข้อความที่ปรับแล้วโดย AI: ระบุเหตุการณ์ ผลกระทบ และกรอบเวลาให้ชัดเจน', reason: 'เพิ่มความเฉพาะเจาะจง' };
  else if (req.schemaName === 'risk_review') data = {
    criteria: aiCriteria_('RISK', Db.readAll('AI_Criteria')).map(function (c, i) { return { name: c, result: ['yes', 'partial', 'no'][i % 3], comment: i % 3 ? 'ควรระบุตัวเลขอ้างอิง' : '' }; }),
    summary: 'เขียนเหตุการณ์ชัดเจน แต่เหตุผลระดับความเสี่ยงยังไม่มีข้อมูลรองรับ',
    issues: [{ field: 'Inherent_Likelihood_Rationale', problem: 'ไม่มีสถิติรองรับ', suggestion: 'ระบุจำนวนครั้งที่เกิดในปีที่ผ่านมา' }],
    improved: { risk_scenario: '', risk_cause: '', consequences: 'ต้องชดเชยเวลาออกอากาศ [ระบุ] ชั่วโมง คิดเป็นรายได้ที่เสีย [ระบุ] บาท/ครั้ง', existing_control: 'Preventive: ตรวจสภาพทุกเดือน (ทีมซ่อมบำรุง, checklist)\nDetective: ระบบแจ้งเตือน (NOC log)\nCorrective: ทีมเวรแก้ไขภายใน 4 ชม. (ticket)', mitigation_plan: '' } };
  else data = { criteria: [{ name: 'a', result: 'partial', comment: '' }], suggestion: 'ระบุสาเหตุและกำหนดเวลาแก้ไข' };
  return { data: data, usage: { input: 1, output: 1 }, provider: 'claude', model: 'mock-model' };
} };
