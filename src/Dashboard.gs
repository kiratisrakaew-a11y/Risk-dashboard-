/**
 * Dashboard — สรุปข้อมูลตามแผนก/งวดประเมิน (pure function มี unit test)
 *
 * data = { risks, kris, values, depts, approvals, aiReviews }  (แถวจาก DB)
 * opts = { deptCodes: [...แผนกที่ผู้ใช้เห็นได้และเลือก], period, today, cfg }
 * ฟังก์ชันนี้กรองตาม deptCodes เสมอ — ผู้เรียกต้องส่งเฉพาะแผนกที่ผ่าน canView_ แล้ว
 */

/** ค่า KRI ล่าสุดตามงวด: map KRI_ID → { period → row } */
function indexKriValues_(values) {
  var idx = {};
  (values || []).forEach(function (v) {
    var id = str_(v.KRI_ID), p = str_(v.Period);
    if (!id || !p) return;
    (idx[id] = idx[id] || {})[p] = v;
  });
  return idx;
}

/** สถานะ KRI ในงวดที่ต้องรายงาน + ประวัติ */
function kriSnapshot_(k, valIdx, today, cfg) {
  var freq = k.Frequency === 'Quarterly' ? 'Quarterly' : 'Monthly';
  var periods = recentPeriods_(freq, today, freq === 'Quarterly' ? 8 : 12);
  var byP = valIdx[k.KRI_ID] || {};
  var cur = periods[0];
  var due = periodDueDate_(cur, cfg.KRI_DUE_DAY);
  var row = byP[cur];
  var history = periods.slice().reverse().map(function (p) {
    var r = byP[p];
    return { period: p, value: r ? num_(r.Value) : null, status: r ? str_(r.Status) : '' };
  });
  // สถานะล่าสุดที่มีค่า (ใช้แสดงสีแม้งวดนี้ยังไม่กรอก)
  var last = null;
  for (var i = history.length - 1; i >= 0; i--) if (history[i].status) { last = history[i]; break; }
  var prev = byP[periods[1]];
  return {
    period: cur, due: due,
    value: row ? (num_(row.Value) === null ? str_(row.Value) : num_(row.Value)) : null,
    status: row ? str_(row.Status) : '',
    prevStatus: prev ? str_(prev.Status) : '',
    lastStatus: last ? last.status : '',
    lastPeriod: last ? last.period : '',
    comment: row ? str_(row.Comment) : '',
    action: row ? str_(row.Action_Taken) : '',
    aiResult: row ? str_(row.AI_Result) : '',
    aiFeedback: row ? str_(row.AI_Feedback) : '',
    missing: !row,
    overdue: !row && today > due,
    history: history
  };
}

function emptyHeat_() {
  var h = [];
  for (var l = 0; l < 5; l++) { h.push([]); for (var i = 0; i < 5; i++) h[l].push([]); }
  return h; // h[likelihood-1][impact-1] = [Risk_ID...]
}

function computeDashboard_(data, opts) {
  var cfg = opts.cfg, today = opts.today, period = opts.period;
  var deptSet = {};
  (opts.deptCodes || []).forEach(function (c) { deptSet[String(c).toUpperCase()] = true; });
  var deptName = {};
  (data.depts || []).forEach(function (d) { deptName[str_(d.Dept_Code).toUpperCase()] = str_(d.Dept_Name) || d.Dept_Code; });

  var risks = (data.risks || []).filter(function (r) {
    return deptSet[str_(r.Business_Unit).toUpperCase()] && str_(r.Assessment_Period) === period && r.Status !== 'Closed';
  });
  var riskById = {};
  risks.forEach(function (r) { riskById[r.Risk_ID] = r; });
  var kris = (data.kris || []).filter(function (k) { return riskById[k.Risk_ID] && isActive_(k.Is_Active); });
  var valIdx = indexKriValues_(data.values);
  var ai = {};
  (data.aiReviews || []).forEach(function (a) { ai[a.Risk_ID] = a; });

  var kpi = { risks: risks.length, byResidual: {}, byInherent: {}, highPlus: 0, kris: kris.length,
    kriRed: 0, kriAmber: 0, kriGreen: 0, kriNoStatus: 0, kriMissing: 0, kriOverdue: 0,
    mitOpen: 0, mitOverdue: 0, mitDueSoon: 0, aiReviewed: 0, aiAvg: null, aiLow: 0 };
  RISK_LEVELS.forEach(function (l) { kpi.byResidual[l.key] = 0; kpi.byInherent[l.key] = 0; });
  var heat = { inherent: emptyHeat_(), residual: emptyHeat_() };
  var byType = {};
  var aiSum = 0;

  risks.forEach(function (r) {
    var il = level_(r.Inherent_Impact), ll = level_(r.Inherent_Likelihood);
    var ri = level_(r.Residual_Impact), rl = level_(r.Residual_Likelihood);
    if (il && ll) heat.inherent[ll - 1][il - 1].push(r.Risk_ID);
    if (ri && rl) heat.residual[rl - 1][ri - 1].push(r.Risk_ID);
    if (r.Inherent_Level) kpi.byInherent[r.Inherent_Level] = (kpi.byInherent[r.Inherent_Level] || 0) + 1;
    if (r.Residual_Level) kpi.byResidual[r.Residual_Level] = (kpi.byResidual[r.Residual_Level] || 0) + 1;
    if (levelRank_(r.Residual_Level) >= levelRank_('High')) kpi.highPlus++;
    var t = str_(r.Risk_Type) || '(ไม่ระบุ)';
    if (!byType[t]) { byType[t] = { type: t, total: 0 }; RISK_LEVELS.forEach(function (l) { byType[t][l.key] = 0; }); }
    byType[t].total++;
    if (r.Residual_Level) byType[t][r.Residual_Level]++;
    var a = ai[r.Risk_ID];
    if (a && num_(a.Score) !== null) {
      kpi.aiReviewed++; aiSum += num_(a.Score);
      if (num_(a.Score) < cfg.SCORE_THRESHOLD) kpi.aiLow++;
    }
  });
  if (kpi.aiReviewed) kpi.aiAvg = Math.round(aiSum / kpi.aiReviewed);

  var worstByRisk = {};
  var kriRows = kris.map(function (k) {
    var s = kriSnapshot_(k, valIdx, today, cfg);
    var r = riskById[k.Risk_ID];
    var st = s.status || s.lastStatus;
    if (st === 'Red') kpi.kriRed++; else if (st === 'Amber') kpi.kriAmber++; else if (st === 'Green') kpi.kriGreen++; else kpi.kriNoStatus++;
    if (s.missing) kpi.kriMissing++;
    if (s.overdue) kpi.kriOverdue++;
    var rank = { Red: 3, Amber: 2, Green: 1 }[st] || 0;
    if (!worstByRisk[k.Risk_ID] || rank > worstByRisk[k.Risk_ID].rank) worstByRisk[k.Risk_ID] = { rank: rank, status: st };
    return {
      KRI_ID: k.KRI_ID, Risk_ID: k.Risk_ID, dept: str_(r.Business_Unit).toUpperCase(), name: k.KRI_Name, type: k.KRI_Type,
      unit: k.Unit, frequency: k.Frequency, direction: k.Direction,
      amber: num_(k.Amber_Threshold), red: num_(k.Red_Threshold), thresholds: kriThresholdText_(k),
      owner: k.Owner_Email, snapshot: s
    };
  });

  var mitigation = [];
  risks.forEach(function (r) {
    if (!str_(r.Mitigation_Plan) || r.Mitigation_Status === 'Done') return;
    kpi.mitOpen++;
    var due = isoDate_(r.Mitigation_Due_Date);
    var left = due ? daysBetween_(today, due) : null;
    var overdue = left !== null && left < 0;
    if (overdue) kpi.mitOverdue++;
    else if (left !== null && left <= cfg.MITIGATION_WARN_DAYS) kpi.mitDueSoon++;
    mitigation.push({ Risk_ID: r.Risk_ID, dept: str_(r.Business_Unit).toUpperCase(), scenario: r.Risk_Scenario,
      plan: r.Mitigation_Plan, due: due, status: r.Mitigation_Status, daysLeft: left, overdue: overdue,
      level: r.Residual_Level, owner: r.Risk_Owner });
  });
  mitigation.sort(function (a, b) { return (a.due || '9999') < (b.due || '9999') ? -1 : 1; });

  var topRisks = risks.slice().sort(function (a, b) {
    return (num_(b.Residual_Score) || 0) - (num_(a.Residual_Score) || 0) || (num_(b.Inherent_Score) || 0) - (num_(a.Inherent_Score) || 0);
  }).slice(0, 10).map(function (r) {
    var a = ai[r.Risk_ID];
    return { Risk_ID: r.Risk_ID, dept: str_(r.Business_Unit).toUpperCase(), type: r.Risk_Type, subtype: r.Risk_Subtype,
      scenario: r.Risk_Scenario, owner: r.Risk_Owner,
      inherentScore: num_(r.Inherent_Score), inherentLevel: r.Inherent_Level,
      residualScore: num_(r.Residual_Score), residualLevel: r.Residual_Level,
      mitigationStatus: r.Mitigation_Status, due: isoDate_(r.Mitigation_Due_Date),
      kriStatus: worstByRisk[r.Risk_ID] ? worstByRisk[r.Risk_ID].status : '',
      aiScore: a ? num_(a.Score) : null, aiGrade: a ? a.Grade : '' };
  });

  // แนวโน้มสถานะ KRI 6 เดือน (KRI รายไตรมาสนับที่เดือนสุดท้ายของไตรมาส)
  var months = recentPeriods_('Monthly', today, 6).reverse();
  var trend = { periods: months, Green: [], Amber: [], Red: [] };
  months.forEach(function (m) {
    var c = { Green: 0, Amber: 0, Red: 0 };
    var qEnd = /-(03|06|09|12)$/.test(m);
    kris.forEach(function (k) {
      var p = k.Frequency === 'Quarterly' ? (qEnd ? quarterPeriod_(m + '-01') : null) : m;
      var row = p && valIdx[k.KRI_ID] && valIdx[k.KRI_ID][p];
      if (row && c[row.Status] !== undefined) c[row.Status]++;
    });
    RAG.forEach(function (s) { trend[s].push(c[s]); });
  });

  // สรุปรายแผนก
  var approvals = {};
  (data.approvals || []).forEach(function (a) {
    if (str_(a.Assessment_Period) === period) approvals[str_(a.Dept_Code).toUpperCase()] = a;
  });
  var byDept = Object.keys(deptSet).sort().map(function (code) {
    var rs = risks.filter(function (r) { return str_(r.Business_Unit).toUpperCase() === code; });
    var ks = kriRows.filter(function (k) { return k.dept === code; });
    var ms = mitigation.filter(function (m) { return m.dept === code; });
    var scored = rs.map(function (r) { return ai[r.Risk_ID] ? num_(ai[r.Risk_ID].Score) : null; }).filter(function (x) { return x !== null; });
    var ap = approvals[code];
    return {
      code: code, name: deptName[code] || code, risks: rs.length,
      highPlus: rs.filter(function (r) { return levelRank_(r.Residual_Level) >= levelRank_('High'); }).length,
      kris: ks.length,
      red: ks.filter(function (k) { return (k.snapshot.status || k.snapshot.lastStatus) === 'Red'; }).length,
      amber: ks.filter(function (k) { return (k.snapshot.status || k.snapshot.lastStatus) === 'Amber'; }).length,
      missing: ks.filter(function (k) { return k.snapshot.missing; }).length,
      overdue: ks.filter(function (k) { return k.snapshot.overdue; }).length,
      mitOverdue: ms.filter(function (m) { return m.overdue; }).length,
      approval: ap ? str_(ap.Status) : 'Draft',
      aiAvg: scored.length ? Math.round(scored.reduce(function (s, x) { return s + x; }, 0) / scored.length) : null
    };
  });

  return {
    period: period, today: today, depts: Object.keys(deptSet).sort(),
    kpi: kpi, heat: heat,
    byType: Object.keys(byType).map(function (t) { return byType[t]; }).sort(function (a, b) { return b.total - a.total; }),
    topRisks: topRisks, kriRows: kriRows, mitigation: mitigation, trend: trend, byDept: byDept,
    riskNames: risks.reduce(function (m, r) { m[r.Risk_ID] = str_(r.Risk_Scenario).slice(0, 160); return m; }, {})
  };
}
