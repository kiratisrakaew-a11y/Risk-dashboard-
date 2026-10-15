# Risk Register & KRI Tracking

Web App (Google Apps Script) ให้แต่ละหน่วยงานกรอก **Risk Register** และติดตาม **Key Risk Indicator (KRI)** แทนการกรอกใน Google Sheet `RISK_REGISTER_TEMPLATE`
แยกสิทธิ์ตามแผนก และทุกแผนกดู Dashboard ของตัวเองได้ มี **AI ช่วยเขียนและช่วยตรวจ** ด้วย (ค่าเริ่มต้น Gemini 3.1 Pro `gemini-3.1-pro-preview` เปลี่ยนเป็น Claude หรือ OpenAI ได้)

## ความสามารถ

| หน้า | เนื้อหา |
|---|---|
| Dashboard | KPI, Heat map 5×5 แบบ Inherent และ Residual (คลิกช่องเพื่อดูรายการ), ระดับความเสี่ยงแยกตามประเภท, แนวโน้มสถานะ KRI 6 เดือน, Top risks, สถานะ KRI, แผนลดความเสี่ยงที่ค้าง, สรุปรายแผนก (เมื่อเห็นหลายแผนก) |
| Risk Register | ตารางกรองได้ และฟอร์มกรอกตามคอลัมน์ของ Sheet เดิม: Risk Type/Sub-type (dropdown จาก Taxonomy), Scenario, Cause, Consequences, Inherent/Residual Impact × Likelihood (แสดงนิยามระดับ และคำนวณระดับให้ทันทีตามชีต MATRIX), Existing control, Mitigation plan, Risk Owner และ KRI |
| กรอกค่า KRI | กรอกค่ารายงวดของทุก KRI ในแผนก (รายเดือนหรือรายไตรมาส ตั้งแยกต่อ KRI ได้) ระบบคิดสถานะ Green/Amber/Red จากเกณฑ์ให้เอง และบังคับให้อธิบายสาเหตุเมื่อเป็น Amber หรือ Red ดูประวัติเป็นกราฟได้ |
| ส่ง / อนุมัติ | แผนกกด "ส่งอนุมัติ" แล้วผู้อนุมัติกด "อนุมัติ" หรือ "ส่งกลับ" (ใช้แทนชีต `Assesment/Review person`) ถ้าแก้ข้อมูลหลังส่ง สถานะจะกลับเป็นร่าง และ Export เป็น Google Sheet ตามรูปแบบเดิมได้ |
| AI ตรวจคุณภาพ | คะแนนรายความเสี่ยง, เกณฑ์ที่ไม่ผ่านบ่อย, ประวัติการตรวจอัตโนมัติ |
| ตั้งค่า (ADMIN) | ผู้ใช้, แผนก, งวดประเมิน, AI provider/model, เกณฑ์ที่ AI ใช้ตรวจ, นำเข้าข้อมูลจาก Sheet เดิม, Export ทุกแผนก |

### ระดับความเสี่ยง (ตามชีต MATRIX เดิม)
คะแนน = Impact × Likelihood แบ่งเป็น **Low** 1–6 (Working group), **Moderate** 7–11 (CEO & MD), **High** 12–19 (RMC) และ **Very High** 20–25 (RMC & BOD)
ความเสี่ยงที่ Residual อยู่ระดับ High ขึ้นไป ต้องมี Mitigation plan และวันที่กำหนดเสร็จ ไม่อย่างนั้นจะบันทึกไม่ได้

### KRI
- **ทิศทาง:** `ค่ามากยิ่งแย่` (≥ Amber = Amber, ≥ Red = Red), `ค่าน้อยยิ่งแย่` (≤ Amber = Amber, ≤ Red = Red) หรือ `เชิงคุณภาพ` (ผู้กรอกเลือกสถานะเอง)
- **งวดที่ต้องรายงาน** คืองวดที่เพิ่งปิด เช่น เดือนตุลาคมต้องรายงานค่าของกันยายน และไตรมาส 3 ต้องกรอกภายในวันที่ `KRI_DUE_DAY` (ค่าเริ่มต้น 10) ของเดือนถัดไป
- เมื่อ KRI เป็น Red ระบบส่งอีเมลแจ้ง ADMIN และผู้อนุมัติของแผนก
- ทุกวัน 08:00 ในวันที่ที่ตั้งไว้ใน `REMINDER_DAYS` ระบบส่งอีเมลเตือน KRI ที่ยังไม่กรอก และแผนที่ใกล้หรือเลยกำหนด ไปยังผู้รับผิดชอบ KRI (หรือ EDITOR ของแผนก ถ้าไม่ได้ระบุผู้รับผิดชอบ)

### AI ช่วยเขียนและช่วยตรวจ
- **✨ AI ช่วยร่าง:** พิมพ์อธิบายความเสี่ยงสั้นๆ แล้ว AI จะร่างทุกช่อง เสนอระดับพร้อมเหตุผลตามนิยามระดับ และเสนอ KRI 2–3 ตัวพร้อมเกณฑ์
  ประเภทความเสี่ยงที่เสนอต้องมีอยู่ใน Taxonomy ถ้าไม่มี ระบบจะล้างค่าทิ้งให้ผู้ใช้เลือกเอง และถ้าเกณฑ์ KRI ขัดกัน ระบบจะเปลี่ยน KRI นั้นเป็นแบบเชิงคุณภาพ
- **🎯 AI แนะนำคะแนน:** AI เทียบเนื้อหาความเสี่ยงกับนิยามระดับ (ชีต `Scale_Definitions`) แล้วแนะนำ Impact และ Likelihood ทั้ง Inherent และ Residual พร้อมเหตุผลที่ใส่ลงช่อง Rationale ได้ทันที
  ฟอร์มแสดงคู่กับคะแนนที่เลือกไว้ (ช่องที่ต่างกันเป็นสีส้ม) พร้อมระดับความมั่นใจ และบอกว่าควรหาข้อมูลอะไรเพิ่ม ระบบไม่ยอมให้ Residual สูงกว่า Inherent
- **✨ AI ปรับข้อความ:** ให้ AI เกลาข้อความในช่องที่เขียนไว้แล้ว ทีละช่อง
- **🔍 AI ตรวจ:** ประเมินทีละเกณฑ์เป็น ผ่าน / บางส่วน / ไม่ผ่าน แล้ว**ระบบคิดคะแนนเอง** (ผ่าน = 1, บางส่วน = 0.5) ได้เกรด A ≥ 85, B ≥ 70, C ≥ 50, D < 50
  พร้อมระบุสิ่งที่ควรแก้ และตัวอย่างการเขียนใหม่ที่กด "ใช้ข้อความนี้" ได้
- **ตรวจคำอธิบาย KRI:** เมื่อค่าเป็น Amber หรือ Red ระบบตรวจว่าคำอธิบายบอกสาเหตุ ผลกระทบ และการแก้ไขครบหรือไม่
- ระบบตรวจอัตโนมัติทุกชั่วโมง เฉพาะความเสี่ยงที่ถูกแก้ไข หรือเมื่อเกณฑ์เปลี่ยน (ใช้ fingerprint จึงไม่เสียค่า API ซ้ำ)
- **AI เป็นผู้เสนอเท่านั้น** ไม่บันทึกแทนผู้ใช้ ข้อมูลที่ส่งให้ AI มีแค่เนื้อหาความเสี่ยง ไม่มีอีเมลผู้ใช้ และจำกัดจำนวนครั้งต่อคนต่อวันด้วย `AI_DAILY_LIMIT`

## สิทธิ์ผู้ใช้

| Role | สิทธิ์ |
|---|---|
| ADMIN | ดู แก้ และอนุมัติได้ทุกแผนก และเข้าหน้า ตั้งค่า |
| EDITOR | กรอกและแก้ข้อมูลของแผนกที่ระบุ และส่งอนุมัติ |
| VIEWER | ดู Dashboard และข้อมูลของแผนกที่ระบุ |
| ผู้อนุมัติของแผนก (`Departments.Approver_Email`) | อนุมัติหรือส่งกลับงวดของแผนกนั้น และดูข้อมูลแผนกนั้นได้ (ไม่ต้องมีชื่อในชีต Users) |

- ช่อง `Departments` ของผู้ใช้ใส่รหัสแผนกได้หลายแผนก โดยคั่นด้วย `,` และใส่ `*` เพื่อให้เห็นทุกแผนก
- **การกรองข้อมูลตามแผนกทำฝั่ง server ทุก API** โดยดูจากอีเมลของผู้ใช้ ไม่เชื่อรหัสแผนกที่หน้าเว็บส่งมา
- Web App รันในสิทธิ์ของผู้ deploy จึง**ไม่ต้องแชร์ไฟล์ DB ให้หน่วยงาน** (และไม่ควรแชร์) เพื่อไม่ให้แผนกเข้าไปเห็นข้อมูลของกันใน Sheet โดยตรง

## ติดตั้ง

1. สร้างโปรเจกต์ Apps Script แบบ standalone ที่ https://script.google.com แล้วนำโค้ดใน `src/` ไปวาง
   หรือใช้ [clasp](https://github.com/google/clasp): `cp .clasp.json.example .clasp.json` ใส่ scriptId แล้วรัน `npm run push`
2. **Project Settings → Script Properties** แล้วเพิ่ม API key ของ AI ที่จะใช้ (ใส่เฉพาะตัวที่ใช้ก็พอ):
   `GEMINI_API_KEY` (ค่าเริ่มต้น สร้าง key ได้ที่ https://aistudio.google.com/apikey), `ANTHROPIC_API_KEY` หรือ `OPENAI_API_KEY`
   ถ้าไม่ใส่ ระบบยังใช้งานได้ตามปกติ แต่ปุ่ม AI จะถูกซ่อน
3. เปิด `Migration.gs` เลือกฟังก์ชัน **`setup`** กด Run แล้วอนุญาตสิทธิ์ ฟังก์ชันนี้จะทำสิ่งต่อไปนี้:
   - สร้างไฟล์ **"Risk Register — DB"** และเก็บ `DB_ID` ไว้ใน Script Properties
   - นำเข้า Taxonomy จากชีต `RISK TAXONOMY` ของ template
   - คัดลอกชีต MATRIX และ Impact & Likelihood มาไว้อ้างอิง
   - ใส่แผนก 15 หน่วยงานตาม "Risk report Log" (Digital Media, Billboard Production, Value Management, Airport & Seven-Eleven Media, Street-Bus, Operation Intelligence, Street - Operation Support, Performance Marketing, Legal, Sales, Purchasing, People, Signboard Tax, THAILAND PRIVILEGE CARD & IBD, Street Static) โดยยังไม่ใส่อีเมลผู้อนุมัติ
   - เพิ่มบัญชีของคุณเป็น ADMIN
   - ติดตั้ง trigger รายชั่วโมงและรายวัน

   รัน `setup` ซ้ำได้โดยข้อมูลไม่หาย ใช้ซ่อมคอลัมน์หรือชีตที่หายไป
4. **ตรวจนิยามระดับ:** เปิดไฟล์ DB ชีต `Scale_Definitions` แล้วแก้คำอธิบาย Impact และ Likelihood ระดับ 1–5 ให้ตรงกับชีต `Ref_Impact_Likelihood` ที่คัดลอกมาจาก template
   ค่าเริ่มต้นในชีตเป็นข้อความทั่วไป และทั้งฟอร์มกับ AI ใช้นิยามจากชีตนี้
5. เติมอีเมลผู้อนุมัติของแต่ละแผนก และเพิ่มผู้ใช้ในหน้า **ตั้งค่า** ของ Web App (หรือแก้ในชีต `Departments` และ `Users` โดยตรงก็ได้)
6. (ไม่บังคับ) นำเข้าข้อมูลจาก Sheet เดิม ได้ 2 ทาง:
   - หน้า ตั้งค่า → นำเข้า (วางลิงก์ Sheet)
   - รันฟังก์ชัน `importLegacyFromTemplate`

   ระบบจะข้าม Risk ID ที่มีอยู่แล้ว และสร้างแผนกจาก Business unit ให้เอง KRI ที่นำเข้ามาจะเป็นแบบเชิงคุณภาพ ให้แก้เป็นตัวเลขพร้อมตั้งเกณฑ์ภายหลัง
7. (ไม่บังคับ) รัน `testAiAssist` เพื่อทดสอบการเชื่อมต่อ AI ผลจะแสดงใน log เท่านั้น ไม่มีการบันทึก
8. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone within <โดเมนบริษัท>**

   แล้วส่งลิงก์ให้หน่วยงาน

## ไฟล์ DB

| ชีต | ใช้ทำอะไร |
|---|---|
| `Users`, `Departments` | สิทธิ์ผู้ใช้ และแผนกพร้อมผู้อนุมัติ |
| `Risks` | Risk Register (คอลัมน์ตาม Sheet เดิม และมี Version กับผู้แก้ไขล่าสุด) |
| `KRIs`, `KRI_Values` | นิยาม KRI และค่ารายงวด |
| `Approvals` | สถานะส่งและอนุมัติต่อแผนกต่องวด |
| `Taxonomy`, `Scale_Definitions` | ประเภทความเสี่ยง และนิยามระดับ 1–5 |
| `AI_Criteria`, `AI_Reviews`, `AI_Runs` | เกณฑ์ที่ AI ใช้ตรวจ ผลตรวจ และประวัติการรัน |
| `Settings` | ค่าระบบที่แก้ได้จากหน้า ตั้งค่า |
| `Audit_Log` | บันทึกทุกการแก้ไข (ก่อนและหลังแก้) |

ทุกการเขียนข้อมูลใช้ `LockService` เพื่อกันไม่ให้หลายคนบันทึกชนกัน และทุกชีตตั้งรูปแบบเซลล์เป็นข้อความ เพื่อไม่ให้ Sheet แปลงค่าอย่าง `2026-10` เป็นวันที่เอง

## พัฒนา / ทดสอบ
```bash
npm test          # unit test (Node ≥ 20): การคำนวณระดับ, งวด/สถานะ KRI, สิทธิ์, Dashboard (ไม่รั่วข้ามแผนก), AI prompt/validate, provider
npm run check     # ตรวจ syntax ของ .gs และ <script> ใน HTML แล้วรัน test
npm run push      # check syntax แล้ว clasp push
```

```
src/
  Config.gs      ค่าตั้ง (ชีต Settings > Script Properties > DEFAULTS)
  Schema.gs      ชีต/คอลัมน์, ระดับความเสี่ยง, ค่าคงที่
  Util.gs        helper (pure)
  RiskLogic.gs   คะแนน/ระดับ, งวด KRI, สถานะ G/A/R, ตรวจข้อมูล, รหัส (pure)
  Auth.gs        สิทธิ์ ADMIN/EDITOR/VIEWER/ผู้อนุมัติ
  Dashboard.gs   สรุปข้อมูลตามแผนก (pure)
  Db.gs          อ่าน/เขียนไฟล์ DB + Lock + Audit
  AiProvider.gs  adapter Claude / OpenAI / Gemini
  AiAssist.gs    AI ช่วยเขียน/ตรวจ + batch รายชั่วโมง
  WebApp.gs      doGet + API ที่หน้าเว็บเรียก
  Migration.gs   setup() + นำเข้าข้อมูลจาก Sheet เดิม
  Export.gs      Export เป็น Google Sheet รูปแบบเดิม
  Triggers.gs    trigger + อีเมลแจ้งเตือน
  ui/            หน้าเว็บ (HTML Service + Chart.js)
tests/           unit test (ข้อมูลสมมติ)
```
