# Risk Register & KRI บน Google Cloud (Cloud Run + Firestore)

เวอร์ชันนี้ใช้ **business logic ชุดเดียวกับ Apps Script** (`../src/*.gs`) — กฎทั้งหมดดูที่ [`docs/BUSINESS_RULES.md`](../docs/BUSINESS_RULES.md)
ต่างกันเฉพาะ: ข้อมูลอยู่ใน Firestore (เร็วกว่าอ่าน Google Sheet มาก), login ด้วย Google ของบริษัท, ตั้งเวลาด้วย Cloud Scheduler, Export เป็นไฟล์ Excel

ระบบเดิมบน Apps Script ยังใช้ได้ตามปกติจนกว่าจะเปลี่ยนมาใช้ตัวนี้

```
cloud/
  server.js          เว็บเซิร์ฟเวอร์ (หน้าเว็บ, /api/*, /auth/*, /download/*, /cron/*)
  lib/runtime.js     โหลด src/*.gs + แทนบริการของ Google (Session, Cache, UrlFetch ฯลฯ)
  lib/db.js          Db (interface เดียวกับ src/Db.gs) บน Firestore
  lib/auth.js        Google sign-in + session cookie
  migrate.js         ย้ายข้อมูลจาก Google Sheet → Firestore (รันครั้งเดียว)
  gs/CloudOverrides.js  ส่วนที่ต่างจาก Apps Script (Export .xlsx)
```

---

## ติดตั้งครั้งแรก (ทำใน Cloud Shell ทีละขั้น)

ตัวอย่างใช้ชื่อโปรเจกต์ `planb-risk-register` — เปลี่ยนเป็นชื่อจริงได้ (ต้องไม่ซ้ำกับใครในโลก)

### 0) ก่อนเริ่ม
ใน Apps Script editor รัน `setup` อีกครั้ง 1 ครั้ง (ให้ข้อมูลใน Sheet สะอาดก่อนย้าย เช่น รวมตัวสะกด Risk Type)

### 1) สร้างโปรเจกต์ + ผูกบัญชีเรียกเก็บเงิน (หน้าเว็บ)
1. เปิด https://console.cloud.google.com/projectcreate → ตั้งชื่อ → Organization เลือก `planbmedia.co.th` → Create
2. เปิด https://console.cloud.google.com/billing/linkedaccount → เลือกโปรเจกต์ → Link a billing account
   (ถ้าไม่มีสิทธิ์ ให้ผู้ดูแล billing ของบริษัททำให้)

### 2) เปิดบริการที่ต้องใช้
```bash
export PROJECT=planb-risk-register
export REGION=asia-southeast1
gcloud config set project $PROJECT
gcloud services enable run.googleapis.com firestore.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com sheets.googleapis.com cloudscheduler.googleapis.com
gcloud firestore databases create --location=$REGION
```

### 3) สร้าง service account ของระบบ + เก็บ Gemini API key
```bash
gcloud iam service-accounts create risk-register --display-name "Risk Register"
export SA=risk-register@$PROJECT.iam.gserviceaccount.com
gcloud projects add-iam-policy-binding $PROJECT --member serviceAccount:$SA --role roles/datastore.user
printf '%s' 'ใส่_GEMINI_API_KEY_ตรงนี้' | gcloud secrets create GEMINI_API_KEY --data-file=-
gcloud secrets add-iam-policy-binding GEMINI_API_KEY --member serviceAccount:$SA --role roles/secretmanager.secretAccessor
```
> ใช้ key เดียวกับที่ใส่ใน Script Properties ของ Apps Script ได้

### 4) ย้ายข้อมูลจาก Google Sheet → Firestore
```bash
cd ~/Risk-dashboard- && git pull
cd cloud && npm ci
gcloud auth application-default login \
  --scopes=https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/spreadsheets.readonly
gcloud auth application-default set-quota-project $PROJECT
GOOGLE_CLOUD_PROJECT=$PROJECT node migrate.js --sheet 1bPflYApNiuDyxvAlmfiUwYSWo6fnCSpIgpx2HiplSg0
```
ผลจะแสดงจำนวนแถวต่อชีตและ ✓ ถ้าตรงกัน — ถ้ารันซ้ำ ชีตที่ย้ายแล้วจะถูกข้าม (ใส่ `--replace` เพื่อย้ายใหม่ทับ)

### 5) Deploy (ครั้งแรก — ยังไม่มี OAuth Client ID)
```bash
cd ~/Risk-dashboard-
gcloud run deploy risk-register --source . --region $REGION \
  --service-account $SA --allow-unauthenticated \
  --max-instances 1 --timeout 900 --memory 512Mi \
  --set-env-vars ALLOWED_DOMAIN=planbmedia.co.th,GOOGLE_CLOUD_PROJECT=$PROJECT,CRON_SA_EMAIL=$SA \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest
```
- ครั้งแรกจะถามสร้าง Artifact Registry → ตอบ `Y`
- จด **Service URL** ที่ได้ (เช่น `https://risk-register-xxxxx.asia-southeast1.run.app`)
- ถ้า error เรื่อง `allUsers` / organization policy: ให้เปลี่ยน `--allow-unauthenticated` เป็น `--no-invoker-iam-check`
  (ระบบตรวจ login ด้วยบัญชีบริษัทเองอยู่แล้ว)

### 6) สร้าง OAuth Client ID สำหรับปุ่ม "Sign in with Google" (หน้าเว็บ)
1. https://console.cloud.google.com/auth/branding → Get started → ชื่อแอป `Risk Register`, อีเมลติดต่อ → Audience: **Internal** → Create
2. https://console.cloud.google.com/auth/clients → Create client → Application type: **Web application**
   - Authorized JavaScript origins: ใส่ Service URL จากขั้น 5 (ไม่มี / ท้าย)
3. คัดลอก **Client ID** แล้วอัปเดต:
```bash
gcloud run services update risk-register --region $REGION --update-env-vars OAUTH_CLIENT_ID=ใส่_CLIENT_ID
```
เปิด Service URL → กด Sign in with Google (บัญชี @planbmedia.co.th) → ใช้งานได้ โดยสิทธิ์มาจากรายชื่อผู้ใช้เดิมที่ย้ายมา

### 7) งานตั้งเวลา (เตือน KRI ค้างกรอก / AI ตรวจอัตโนมัติ)
```bash
export URL=$(gcloud run services describe risk-register --region $REGION --format 'value(status.url)')
gcloud scheduler jobs create http rr-daily --location $REGION --schedule "0 8 * * *" --time-zone Asia/Bangkok \
  --uri "$URL/cron/daily" --http-method POST --oidc-service-account-email $SA --oidc-token-audience "$URL/cron/daily"
gcloud scheduler jobs create http rr-ai-batch --location $REGION --schedule "0 * * * *" --time-zone Asia/Bangkok \
  --uri "$URL/cron/ai-batch" --http-method POST --oidc-service-account-email $SA --oidc-token-audience "$URL/cron/ai-batch" \
  --attempt-deadline 900s
```
> อีเมลแจ้งเตือนยังปิดอยู่ในเวอร์ชันนี้ (บันทึกเป็น log) — เปิดใช้ได้ภายหลังเมื่อผู้ดูแล Workspace อนุญาต Gmail API

---

## อัปเดตโค้ดครั้งต่อไป
```bash
cd ~/Risk-dashboard- && git pull
gcloud run deploy risk-register --source . --region asia-southeast1
```
(ค่าตั้ง/secret เดิมคงอยู่ — URL ไม่เปลี่ยน) · Apps Script ยัง `npm run push` ได้ตามเดิมถ้ายังใช้คู่กัน

## นำเข้า Risk Register (ไฟล์ Excel/Sheet เดิมของแผนก)
แชร์ไฟล์ Google Sheet นั้น (สิทธิ์ Viewer) ให้ `risk-register@<PROJECT>.iam.gserviceaccount.com` ก่อน แล้วนำเข้าที่หน้า ตั้งค่า เหมือนเดิม

## ค่าใช้จ่ายโดยประมาณ
- Cloud Run + Firestore: ปริมาณใช้งานระดับนี้อยู่ใน free tier เกือบทั้งหมด (~0–100 บาท/เดือน, ไม่รวมค่า Gemini)
- `min-instances=0`: เปิดครั้งแรกหลังไม่มีคนใช้นานจะช้า 2–4 วินาที จากนั้นเร็ว
  ถ้าอยากให้เร็วตลอด: `gcloud run services update risk-register --region asia-southeast1 --min-instances 1` (~200–400 บาท/เดือน)

## ตัวแปรสภาพแวดล้อม
| ชื่อ | ความหมาย |
|---|---|
| `OAUTH_CLIENT_ID` | Client ID ของปุ่ม Sign in with Google |
| `ALLOWED_DOMAIN` | โดเมนที่อนุญาต (คั่น , ได้หลายโดเมน) |
| `GOOGLE_CLOUD_PROJECT` | Project ID (ใช้ลิงก์ไปหน้า Firestore ในหน้า ตั้งค่า) |
| `CRON_SA_EMAIL` | service account ที่ Cloud Scheduler ใช้เรียก `/cron/*` |
| `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | API key ของ AI (จาก Secret Manager) |
| `SESSION_SECRET` | (ไม่บังคับ) คีย์เซ็น cookie — ไม่ใส่ระบบสร้างและเก็บใน Firestore ให้เอง |

## พัฒนา / ทดสอบในเครื่อง
```bash
cd cloud && npm ci
npm test                      # unit test ของส่วน Cloud
npm run dev                   # รันด้วยข้อมูลตัวอย่างในหน่วยความจำ (ไม่ต้อง login) → http://localhost:8080
DEV_USER='*' MEMORY_DB=1 DEV_EXTRA_GS=test/ai-mock.js node server.js   # สลับผู้ใช้ด้วย ?user=editor@co.th + AI จำลอง
```
`DEV_USER` ใช้ไม่ได้บน Cloud Run (ระบบจะไม่ยอมเริ่มทำงาน)

## หลักการทำงาน (สำหรับผู้พัฒนา)
- โค้ด `.gs` เป็น synchronous แต่ Firestore/HTTP บน Node เป็น async:
  - ข้อมูลทุก collection อยู่ในหน่วยความจำของ instance (`max-instances=1`) โหลดใหม่เฉพาะเมื่อ version ใน `_meta/state` เปลี่ยน
  - การเขียนของแต่ละ request อยู่ใน buffer → สำเร็จจึงบันทึกลง Firestore ครั้งเดียว (error = ไม่มีอะไรถูกเขียน)
  - `UrlFetchApp` / `SpreadsheetApp` ใช้ *record & replay*: ครั้งแรกจดคำขอ → server ดึงแบบ async → รันฟังก์ชันใหม่ด้วยผลที่ได้
    (ไม่บล็อกผู้ใช้อื่นระหว่างรอ AI, ไม่บันทึกซ้ำ, โควตา AI ไม่ถูกนับซ้ำ)
- หน้าเว็บใช้ `src/ui/*.html` ชุดเดิม + shim ที่แปลง `google.script.run.X()` เป็น `POST /api/X`
