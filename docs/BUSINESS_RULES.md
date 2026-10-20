# Business Rules — Risk Register & KRI

เอกสารนี้รวบรวมกฎทางธุรกิจทั้งหมดของระบบ ใช้เป็นข้อตกลงร่วมระหว่างเจ้าของงาน (Risk Management) กับผู้พัฒนา
และเป็น **checklist ตรวจรับ** ก่อนเปลี่ยนจาก Apps Script ไปใช้เวอร์ชัน Google Cloud

**หลักการ:** กฎทุกข้ออยู่ในไฟล์ `src/*.gs` ชุดเดียว — ทั้ง Apps Script และ Cloud Run โหลดไฟล์เดียวกันนี้
(Cloud เปลี่ยนเฉพาะที่เก็บข้อมูล / login / ตั้งเวลา / export ดู [ส่วนที่ต่างกัน](#ส่วนที่ต่างกันระหว่าง-apps-script-กับ-cloud))
แก้กฎที่ `src/*.gs` ที่เดียว แล้ว deploy ทั้งสองที่ → ทำงานเหมือนกัน

คอลัมน์ "ทดสอบ" อ้างชื่อ test ใน `tests/*.test.js` (รันด้วย `npm run check`)

---

## 1. ผู้ใช้และสิทธิ์

| # | กฎ | โค้ด | ทดสอบ |
|---|---|---|---|
| A1 | สิทธิ์มี 3 ระดับจากชีต/collection `Users`: **ADMIN** เห็น-แก้-อนุมัติทุกแผนก + ตั้งค่า, **EDITOR** กรอก/แก้เฉพาะแผนกของตัวเอง, **VIEWER** ดูอย่างเดียว | `parseUser_`, `canView_`, `canEdit_`, `canApprove_` (`src/Auth.gs`) | auth: "ADMIN เห็น/แก้/อนุมัติทุกแผนก", "EDITOR แก้ได้เฉพาะแผนกตัวเอง ไม่อนุมัติ", "VIEWER ดูได้อย่างเดียว…" |
| A2 | `Departments` ของผู้ใช้คั่นด้วย `,` ได้หลายแผนก; `*` = ทุกแผนก | `parseUser_` | auth: "* = ทุกแผนก…" |
| A3 | Role ที่ไม่รู้จัก = VIEWER; ผู้ใช้ที่ปิดใช้งาน (`Is_Active`=FALSE) หรือไม่มีในระบบ = ไม่มีสิทธิ์เข้าใช้ | `parseUser_`, `resolveUser_` | auth: "* = ทุกแผนก; ผู้ใช้ปิดใช้งาน/ไม่รู้จัก = ไม่มีสิทธิ์; Role แปลก = VIEWER" |
| A4 | ผู้อนุมัติของแผนก (`Departments.Approver_Email`) อนุมัติ/ส่งกลับงวดของแผนกนั้นได้ และเห็นข้อมูลแผนกนั้น แม้ไม่มีชื่อในชีต Users | `resolveUser_`, `canApprove_` | auth: "ผู้อนุมัติที่ไม่มีในชีต Users เห็นเฉพาะแผนกที่อนุมัติ" |
| A5 | สิทธิ์ตรวจที่ server ทุกครั้งจากอีเมลผู้ login — ไม่เชื่อค่าแผนกที่หน้าเว็บส่งมา; เรียก API ข้ามแผนกตรงๆ ต้องถูกปฏิเสธ | `requireView_`, `requireEdit_`, `deptCodesFor_` (`src/WebApp.gs`) | dashboard: "แผนก FIN เห็นเฉพาะข้อมูล FIN…"; flows: "กรอก KRI…" (KRI แผนกอื่น) |

## 2. หน่วยงาน

| # | กฎ | โค้ด | ทดสอบ |
|---|---|---|---|
| D1 | หน่วยงานมาตรฐาน 23 แผนกตาม instruction ของบริษัท (CXM, IBD, TPC, PMKT, SALESCS, SUNBEAM, VM, ACCFIN, EXEC, IT, LEGAL, PEOPLE, PUR, AIR711, BBOPS, BBP, BDA, DIGPROD, STOPS, OI, SBTAX, STBUS, STSTAT) | `DEPARTMENT_SEED` (`src/Schema.gs`) | logic: "DEPARTMENT_SEED: 23 หน่วยงาน…" |
| D2 | setup เพิ่มแผนกที่ยังไม่มี และปิดรหัสรุ่นก่อน (DM, SALES, TPCIBD) เฉพาะที่ยังไม่มี Risk | `planDeptSync_` (`src/Migration.gs`) | logic: "planDeptSync_…" |
| D3 | แต่ละแผนกมีคำอธิบายหน้าที่ (`Description`) ส่งให้ AI ใช้ประกอบการแนะนำ | `aiContext_`, `deptText_` (`src/AiAssist.gs`) | ai: "buildSuggestPrompt_ draft…" |

## 3. Risk Register

| # | กฎ | โค้ด | ทดสอบ |
|---|---|---|---|
| R1 | **Risk ID สร้างอัตโนมัติ** ตอนบันทึกครั้งแรก: `รหัสแผนก-R-เลข 3 หลัก` (เลขสูงสุดของแผนกนั้นทุกงวด + 1) — ผู้ใช้ไม่ต้องกรอก, แก้ไม่ได้ | `nextRiskId_`, `nextSeqId_` (`src/RiskLogic.gs`), `apiSaveRisk` | logic: "รหัส Risk / KRI / แผนก"; flows: "ความเสี่ยงใหม่เป็น New Risk…" |
| R2 | KRI ID = `Risk ID-K1`, `-K2`, … | `nextKriId_` | logic: "รหัส Risk / KRI / แผนก" |
| R3 | ความเสี่ยงที่เพิ่มใหม่เป็น **New Risk** เสมอ (Reassessment ใช้กับรายการเดิมเท่านั้น) | `apiSaveRisk` | flows: "ความเสี่ยงใหม่เป็น New Risk เสมอ…" |
| R4 | ย้ายแผนกของความเสี่ยงที่บันทึกแล้วผ่านหน้าเว็บไม่ได้ | `apiSaveRisk` | flows: "…และย้ายแผนกผ่านหน้าเว็บไม่ได้" |
| R5 | เพิ่มความเสี่ยงได้เฉพาะงวดประเมินปัจจุบัน (`ASSESSMENT_PERIOD`; ว่าง = ปีปัจจุบัน) | `renderRegister` (`src/ui/App.html`), `getConfig_` | UI |
| R6 | ช่องบังคับ: Risk Type, Sub-type, Scenario, Cause, Consequences, คะแนน + เหตุผล Inherent/Residual, Existing control, Risk Owner | `validateRisk_` | logic: "validateRisk_: ช่องบังคับ…" |
| R7 | Risk Type / Sub-type ต้องเป็นคู่ที่อยู่ใน Taxonomy | `validateRisk_` | logic: "validateRisk_…Taxonomy" |
| R8 | Risk Type ที่สะกดต่างกันแค่ตัวพิมพ์/ช่องว่าง (เช่น "Operational Risk" / "Operational risk") ถือเป็นประเภทเดียว ใช้ตัวสะกดที่มีใน Taxonomy มากที่สุด | `typeKey_`, `typeCanon_`, `canonType_`, `normalizeRiskTypes_` | logic: "Risk Type ที่สะกดต่างแค่ตัวพิมพ์…", "Dashboard รวมกลุ่ม…" |
| R9 | ระดับ **High ขึ้นไป** (Residual) ต้องมี Mitigation plan และกำหนดเสร็จ | `validateRisk_` | logic: "validateRisk_…High+ ต้องมีแผน" |
| R10 | คำเตือน (บันทึกได้): Residual สูงกว่า Inherent, แผนเลยกำหนด, ยังไม่มี KRI / Leading KRI, control ยังไม่แยก P/D/C, Reassessment ข้อมูลไม่ครบ | `validateRisk_` | logic: "validateRisk_…คำเตือน" |
| R11 | Exiting control แยกเป็น Preventive / Detective / Corrective (เก็บรวมในช่องเดียว รองรับหัวข้อภาษาไทย) | `parseControls_`, `joinControls_` | logic: "parseControls_ / joinControls_…" |
| R12 | ปิดความเสี่ยงได้ (ไม่ลบ) — ข้อมูลยังดูได้ในตัวกรอง "ปิดแล้ว" และไม่นับใน Dashboard | `apiSetRiskStatus`, `computeDashboard_` | dashboard: "…ไม่นับ Risk ที่ปิด/งวดอื่น" |
| R13 | การแก้ไขทุกครั้งเพิ่ม Version และบันทึก Audit_Log (ก่อน/หลัง) | `apiSaveRisk`, `Db.audit` | cloud: "บันทึก Risk ใหม่…" |
| R14 | นำเข้า Risk Register จากลิงก์ Google Sheet (ADMIN): **ตรวจสอบก่อน** — แสดงว่าแต่ละแถวจะไปแผนก/งวดไหน, แถวที่ข้าม (Risk ID มีแล้ว/ซ้ำในไฟล์), แผนกที่จะสร้างใหม่ และข้อควรตรวจ — ยังไม่บันทึกจนกดยืนยัน; Risk ID ที่มีอยู่แล้วไม่ถูกเขียนทับ | `planLegacyImport_`, `importLegacyRegister_` (`src/Migration.gs`) | logic: "planLegacyImport_…"; flows: "นำเข้าจาก Google Sheet…" |

## 4. การให้คะแนนและระดับความเสี่ยง

| # | กฎ | โค้ด | ทดสอบ |
|---|---|---|---|
| S1 | คะแนน = Impact × Likelihood (1–5 × 1–5) | `riskScore_` | logic: "riskScore_ / riskLevel_ ตรงกับชีต MATRIX ทุกช่อง" |
| S2 | ระดับ: **Low 1–6** (Working group) · **Medium 7–11** (CEO & MD) · **High 12–19** (RMC) · **Very High 20–25** (RMC & BOD) พร้อมแนวทางจัดการตามเกณฑ์บริษัท | `RISK_LEVELS`, `riskLevel_` | logic: เดียวกับ S1 |
| S3 | Impact ประเมิน 5 มิติ (Financial, Legal & Compliance, Reputation, Operations, ESG) ใช้ **มิติที่คะแนนสูงสุด** | `scaleSeed_`, `validateScoreSuggestion_` | logic: "scaleSeed_…"; ai: "validateScoreSuggestion_ inherent…" |
| S4 | Likelihood ใช้ความถี่ + % โอกาสเกิดตามเกณฑ์บริษัท | `scaleSeed_` | logic: "scaleSeed_…" |
| S5 | ตารางเกณฑ์ Impact/Likelihood/Matrix เปิดดูได้จากทุกหน้าที่เกี่ยวข้อง | `scaleModalHtml` (`src/ui/App.html`) | UI |

## 5. KRI

| # | กฎ | โค้ด | ทดสอบ |
|---|---|---|---|
| K1 | ความถี่ตั้งราย KRI: รายเดือน (`YYYY-MM`) หรือรายไตรมาส (`YYYY-Qn`); งวดที่กรอกต้องตรงกับความถี่ | `periodFor_`, `apiSaveKriValues` | logic: "งวด KRI…"; flows: "กรอก KRI…" |
| K2 | งวดที่ต้องรายงาน = งวดที่ปิดแล้วล่าสุด; กำหนดกรอก = วันที่ `KRI_DUE_DAY` (ค่าเริ่มต้น 10) ของเดือนถัดจากสิ้นงวด | `reportingPeriod_`, `periodDueDate_` | logic: "งวด KRI…" |
| K3 | สถานะคำนวณจากเกณฑ์: **ค่ามากยิ่งแย่** ≥Red=Red, ≥Amber=Amber; **ค่าน้อยยิ่งแย่** ≤Red=Red, ≤Amber=Amber; **Qualitative** ผู้กรอกเลือกสีเอง | `kriStatus_` | logic: "kriStatus_…"; flows: "กรอก KRI…" |
| K4 | เกณฑ์ต้องสอดคล้องทิศทาง (ค่ามากยิ่งแย่: Amber < Red; ค่าน้อยยิ่งแย่: Amber > Red) | `validateKri_` | logic: "validateKri_…" |
| K5 | สถานะ **Amber/Red ต้องอธิบายสาเหตุ** (Comment) | `apiSaveKriValues` | flows: "กรอก KRI…" |
| K6 | ค่า KRI แบบตัวเลขต้องเป็นตัวเลข; กรอก KRI ของแผนกอื่นไม่ได้ | `apiSaveKriValues` | flows: "กรอก KRI…" |
| K7 | เปลี่ยนเป็น Red → แจ้ง ADMIN และผู้อนุมัติของแผนก | `notifyRedKris_` (`src/Triggers.gs`) | flows: "กรอก KRI…" (มีอีเมล 1 ฉบับ) |
| K8 | KRI ที่นำเข้าจาก Sheet เดิมเป็น Qualitative (ต้องตั้งตัวเลขเองภายหลัง) | `importLegacyRegister_` | cloud: "นำเข้า Risk Register เดิม…" |

## 6. ส่ง / อนุมัติ (รายแผนก รายงวด)

| # | กฎ | โค้ด | ทดสอบ |
|---|---|---|---|
| P1 | สถานะ: Draft → **Submitted** → **Approved** หรือ **Returned** (ส่งกลับแล้วส่งใหม่ได้) | `apiApprovalAction` | flows: "ส่ง/อนุมัติ…" |
| P2 | ส่งได้เมื่อมีสิทธิ์แก้แผนกนั้น และมีความเสี่ยงที่ไม่ปิดในงวดนั้นอย่างน้อย 1 รายการ | `apiApprovalAction` | flows: "ส่ง/อนุมัติ…" |
| P3 | อนุมัติ/ส่งกลับได้เฉพาะ ADMIN หรือผู้อนุมัติของแผนก และต้องอยู่ในสถานะ Submitted | `apiApprovalAction`, `canApprove_` | flows: "ส่ง/อนุมัติ…" |
| P4 | งวดที่อนุมัติแล้วส่งซ้ำไม่ได้ | `apiApprovalAction` | flows: "ส่ง/อนุมัติ…" |
| P5 | แจ้งเตือน: ส่ง → ผู้อนุมัติของแผนก (ไม่มี = ADMIN); อนุมัติ/ส่งกลับ → ผู้ส่ง | `notifyApproval_` | flows: "ส่ง/อนุมัติ…" |

## 7. Dashboard และการแจ้งเตือน

| # | กฎ | โค้ด | ทดสอบ |
|---|---|---|---|
| B1 | แต่ละแผนกเห็นเฉพาะข้อมูลแผนกตัวเอง (ADMIN เห็นภาพรวมทุกแผนก) | `computeDashboard_`, `deptCodesFor_` | dashboard: "แผนก FIN เห็นเฉพาะข้อมูล FIN…", "ภาพรวมหลายแผนก…" |
| B2 | Heatmap Inherent/Residual, KPI ระดับความเสี่ยง, KRI ค้าง/เลยกำหนด, แผนลดความเสี่ยงเลย/ใกล้กำหนด (`MITIGATION_WARN_DAYS` = 30 วัน), Top risks, trend 6 เดือน | `computeDashboard_`, `kriSnapshot_` | dashboard: ทุกข้อ |
| B3 | อีเมลเตือนรายการค้าง (KRI ค้างกรอก, แผนใกล้/เลยกำหนด) วันที่ `REMINDER_DAYS` (1, 5, 10) ของเดือน คนละ 1 ฉบับ | `dailyJob`, `sendReminders_` | — (ตรวจด้วยมือ) |

## 8. AI ช่วยเขียน / ตรวจ

| # | กฎ | โค้ด | ทดสอบ |
|---|---|---|---|
| I1 | AI ทำหน้าที่ตามบทบาท ERM ของบริษัท ใช้ Gemini 3.1 เป็นค่าเริ่มต้น (เปลี่ยนเป็น Claude/OpenAI ได้) | `AI_SYSTEM_BASE`, `DEFAULT_MODELS` | provider: ทุกข้อ |
| I2 | **ไม่เดา:** ข้อมูลขั้นต่ำไม่ครบ → ถามกลับโดยไม่เรียก AI (และไม่นับโควตา) | `missingIntake_`, `intakeResponse_`, `aiSuggest_` | logic: "missingIntake_…"; flows: "AI แนะนำคะแนน…" |
| I3 | ข้อมูลขั้นต่ำ **Inherent**: Scenario + ผลกระทบ (หรือมิติที่กระทบ) + ความถี่/ข้อมูลการเกิด | `missingIntake_` | logic: "missingIntake_…" |
| I4 | ข้อมูลขั้นต่ำ **Residual**: มีคะแนน Inherent แล้ว + control แยก P/D/C; ถ้า Reassessment ต้องมีช่วงเวลาทบทวน (R3), จำนวนเหตุการณ์จริง + ตัวอย่าง (R4), มิติที่กระทบจริง (R5) | `missingIntake_` | logic: "missingIntake_…" |
| I5 | วิธีคิดต่างกัน: Inherent = สถานการณ์ที่สมจริงหากไม่มีมาตรการควบคุม; Residual = ประเมินประสิทธิผลของ control แต่ละตัว | `buildSuggestPrompt_` (score) | ai: "AI แนะนำคะแนน Inherent / Residual: prompt ใช้หลักการต่างกัน" |
| I6 | คะแนน Residual ที่ AI เสนอ **ไม่เกิน Inherent** (ถูกปรับลงพร้อมแจ้งเหตุผล) | `validateScoreSuggestion_` | ai: "validateScoreSuggestion_ residual…"; flows: "AI แนะนำคะแนน…" |
| I7 | คะแนนที่ไม่มีเหตุผลประกอบ = ไม่ได้ให้คะแนน | `validateSuggestion_` | ai: "ช่วยร่าง: …คะแนนที่ไม่มีเหตุผลถือว่ายังไม่ได้ให้" |
| I8 | แนะนำ Risk Type/Sub-type จาก Scenario: เฉพาะคู่ใน Taxonomy, สูงสุด 3 ตัวเลือก | `validateClassify_` | ai: "validateClassify_…" |
| I9 | AI ตรวจคุณภาพตามเกณฑ์ในหน้า ตั้งค่า — ระบบคิดคะแนนเอง (ไม่เชื่อตัวเลขจากโมเดล); ตรวจซ้ำเฉพาะเมื่อเนื้อหา/KRI/เกณฑ์เปลี่ยน | `validateRiskReview_`, `riskFingerprint_`, `runAiBatch` | ai: "validateRiskReview_…", "riskFingerprint_…" |
| I10 | จำกัดการใช้ AI ต่อผู้ใช้ต่อวัน (`AI_DAILY_LIMIT` = 40) | `checkAiQuota_` | flows: "AI: จำกัดจำนวนครั้ง…" |
| I11 | แสดงข้อความ disclaimer ของบริษัทใต้ผล AI ทุกครั้ง; AI เป็นข้อเสนอ ผู้ใช้ต้องกดยืนยันเอง | `DISCLAIMER`, `src/ui/App.html` | UI |

## 9. ค่าตั้งค่า (ADMIN แก้ได้ในหน้า ตั้งค่า)

`ASSESSMENT_PERIOD` (ว่าง = ปีปัจจุบัน) · `KRI_DUE_DAY` 10 · `REMINDER_DAYS` 1,5,10 · `MITIGATION_WARN_DAYS` 30 ·
`AI_PROVIDER` gemini · `AI_MODEL` (ว่าง = ค่าเริ่มต้น) · `AI_EFFORT` low · `AI_DAILY_LIMIT` 40 · `AI_BATCH_SIZE` 15 · `SCORE_THRESHOLD` 70
— ลำดับความสำคัญ: Settings > Script Properties / ตัวแปรสภาพแวดล้อม > ค่าเริ่มต้น (`mergeConfig_`, logic: "mergeConfig_…")

API key ไม่เก็บในฐานข้อมูล: Apps Script = Script Properties, Cloud = Secret Manager

---

## ส่วนที่ต่างกันระหว่าง Apps Script กับ Cloud

ไม่ใช่ business rule — เป็นเรื่องเทคนิคของแต่ละแพลตฟอร์ม

| เรื่อง | Apps Script | Cloud Run |
|---|---|---|
| ที่เก็บข้อมูล | Google Sheet "Risk Register — DB" | Firestore (collection ชื่อเดียวกับชีต) — `cloud/lib/db.js` |
| Login | บัญชี Google ของโดเมน (Apps Script) | Google sign-in เฉพาะ `ALLOWED_DOMAIN` — `cloud/lib/auth.js` |
| งานตั้งเวลา | Apps Script trigger | Cloud Scheduler → `/cron/daily`, `/cron/ai-batch` |
| Export | สร้าง Google Sheet | ดาวน์โหลด .xlsx (ข้อมูลจาก `exportData_` เดียวกัน) |
| นำเข้า Sheet เดิม | เปิดด้วยสิทธิ์ผู้ deploy | ต้องแชร์ไฟล์ให้ service account ของ Cloud Run |
| อีเมลแจ้งเตือน | MailApp | ยังปิดอยู่ (บันทึกใน log) — เปิดภายหลังด้วย Gmail API |

## Checklist ตรวจรับก่อนเปลี่ยนไปใช้ Cloud

- [ ] `npm run check` และ `cd cloud && npm test` ผ่านทั้งหมด
- [ ] จำนวนข้อมูลตรงกับ Sheet (ผล `migrate.js` ✓ ทุก collection)
- [ ] login ด้วยบัญชีบริษัทได้ / บัญชีอื่นถูกปฏิเสธ
- [ ] EDITOR เห็นเฉพาะแผนกตัวเอง (A1–A5)
- [ ] เพิ่มความเสี่ยงใหม่ได้ Risk ID ต่อจากเดิม (R1)
- [ ] กรอก KRI / ส่ง / อนุมัติ ได้ตามกฎ (K1–K7, P1–P5)
- [ ] AI ช่วยร่าง / แนะนำประเภท / แนะนำคะแนน / ตรวจ ใช้ได้ (I1–I11)
- [ ] Export ได้ไฟล์ Excel ครบทุกรายการ
