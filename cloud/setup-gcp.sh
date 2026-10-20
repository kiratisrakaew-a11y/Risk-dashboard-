#!/usr/bin/env bash
# ติดตั้ง Risk Register บน Google Cloud ทั้งหมดในคำสั่งเดียว (รันใน Cloud Shell)
#
#   bash cloud/setup-gcp.sh <PROJECT_ID>
#
# รันซ้ำได้ — ขั้นที่ทำแล้วจะข้าม
#   MIGRATE_REPLACE=1  ย้ายข้อมูลจาก Sheet ใหม่ทับของเดิมใน Firestore (วันเปลี่ยนระบบจริง)
#   SKIP_MIGRATE=1     ไม่ย้ายข้อมูล (เช่น แค่ deploy โค้ดใหม่)
# ต้องสร้างโปรเจกต์ + ผูก billing บนหน้าเว็บก่อน (ดู cloud/README.md ขั้น 1)
set -euo pipefail

PROJECT="${1:-}"
REGION="${REGION:-asia-southeast1}"
SERVICE="risk-register"
DOMAIN="${ALLOWED_DOMAIN:-planbmedia.co.th}"
DB_SHEET="${DB_SHEET:-1bPflYApNiuDyxvAlmfiUwYSWo6fnCSpIgpx2HiplSg0}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ -z "$PROJECT" ]; then echo "ใช้: bash cloud/setup-gcp.sh <PROJECT_ID>"; exit 1; fi
SA="$SERVICE@$PROJECT.iam.gserviceaccount.com"
step() { echo; echo "━━━ $* ━━━"; }

step "1/8 ตั้งค่าโปรเจกต์ $PROJECT"
gcloud config set project "$PROJECT" >/dev/null
BILLING=$(gcloud beta billing projects describe "$PROJECT" --format='value(billingEnabled)' 2>/dev/null || echo unknown)
if echo "$BILLING" | grep -qi false; then
  echo "⚠ โปรเจกต์ยังไม่ได้ผูก billing — เปิด https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT แล้วรันใหม่"
  exit 1
fi

step "2/8 เปิดบริการ (ใช้เวลา 1–2 นาที)"
gcloud services enable run.googleapis.com firestore.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com sheets.googleapis.com cloudscheduler.googleapis.com

step "3/8 Firestore ($REGION)"
if gcloud firestore databases describe --database='(default)' >/dev/null 2>&1; then echo "มีอยู่แล้ว — ข้าม"
else gcloud firestore databases create --location="$REGION"; fi

step "4/8 service account + สิทธิ์"
gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 || gcloud iam service-accounts create "$SERVICE" --display-name "Risk Register"
gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$SA" --role roles/datastore.user --condition=None >/dev/null
# บัญชีที่ใช้ build จาก source (บางโปรเจกต์ใหม่ต้องให้สิทธิ์นี้เพิ่ม)
PN=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$PN-compute@developer.gserviceaccount.com" \
  --role roles/run.builder --condition=None >/dev/null 2>&1 || true
# ให้ Cloud Scheduler ออก token ในนาม service account นี้ได้
gcloud iam service-accounts add-iam-policy-binding "$SA" --member "serviceAccount:$SA" --role roles/iam.serviceAccountTokenCreator >/dev/null

step "5/8 Gemini API key → Secret Manager"
if gcloud secrets describe GEMINI_API_KEY >/dev/null 2>&1; then echo "มีอยู่แล้ว — ข้าม (เปลี่ยน key: gcloud secrets versions add GEMINI_API_KEY --data-file=-)"
else
  read -r -s -p "วาง Gemini API key (ตัวเดียวกับใน Script Properties) แล้วกด Enter: " KEY; echo
  printf '%s' "$KEY" | gcloud secrets create GEMINI_API_KEY --data-file=-
  unset KEY
fi
gcloud secrets add-iam-policy-binding GEMINI_API_KEY --member "serviceAccount:$SA" --role roles/secretmanager.secretAccessor >/dev/null

step "6/8 ย้ายข้อมูลจาก Google Sheet → Firestore"
if [ "${SKIP_MIGRATE:-}" = 1 ]; then echo "SKIP_MIGRATE=1 — ข้าม"; else
cd "$ROOT/cloud" && npm ci --no-audit --no-fund --silent
if ! gcloud auth application-default print-access-token >/dev/null 2>&1 || [ "${RELOGIN:-}" = 1 ]; then
  echo "จะให้ login อีกครั้งเพื่ออ่าน Google Sheet — เปิดลิงก์ที่ขึ้น แล้วคัดลอกรหัสกลับมาวาง"
  gcloud auth application-default login \
    --scopes=https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/spreadsheets.readonly
fi
gcloud auth application-default set-quota-project "$PROJECT" >/dev/null 2>&1 || true
GOOGLE_CLOUD_PROJECT="$PROJECT" node migrate.js --sheet "$DB_SHEET" ${MIGRATE_REPLACE:+--replace}
cd "$ROOT"
fi

step "7/8 Deploy ขึ้น Cloud Run (build ครั้งแรก ~3–5 นาที)"
ENV="ALLOWED_DOMAIN=$DOMAIN,GOOGLE_CLOUD_PROJECT=$PROJECT,CRON_SA_EMAIL=$SA"
EXISTING_CLIENT=$(gcloud run services describe "$SERVICE" --region "$REGION" --format=json 2>/dev/null \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const e=JSON.parse(s).spec.template.spec.containers[0].env||[];const c=e.find(x=>x.name==='OAUTH_CLIENT_ID');process.stdout.write(c?c.value:'')}catch(x){}})" || true)
[ -n "${OAUTH_CLIENT_ID:-$EXISTING_CLIENT}" ] && ENV="$ENV,OAUTH_CLIENT_ID=${OAUTH_CLIENT_ID:-$EXISTING_CLIENT}"
deploy() {
  gcloud run deploy "$SERVICE" --source "$ROOT" --region "$REGION" --service-account "$SA" "$1" \
    --max-instances 1 --timeout 900 --memory 512Mi --quiet \
    --set-env-vars "$ENV" --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest
}
if ! deploy --allow-unauthenticated; then
  echo "เปิดสาธารณะไม่ได้ (นโยบายองค์กร) — ลองแบบ --no-invoker-iam-check (ระบบตรวจ login บัญชีบริษัทเองอยู่แล้ว)"
  deploy --no-invoker-iam-check
fi
URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --format 'value(status.url)')

step "8/8 งานตั้งเวลา (Cloud Scheduler)"
job() {
  local name=$1 schedule=$2 path=$3
  local args=(--location "$REGION" --schedule "$schedule" --time-zone Asia/Bangkok --uri "$URL/cron/$path" --http-method POST
    --oidc-service-account-email "$SA" --oidc-token-audience "$URL/cron/$path" --attempt-deadline 900s)
  if gcloud scheduler jobs describe "$name" --location "$REGION" >/dev/null 2>&1; then gcloud scheduler jobs update http "$name" "${args[@]}" >/dev/null
  else gcloud scheduler jobs create http "$name" "${args[@]}" >/dev/null; fi
  echo "✓ $name ($schedule)"
}
job rr-daily "0 8 * * *" daily
job rr-ai-batch "0 * * * *" ai-batch

echo
echo "════════════════════════════════════════════════════════"
echo " URL ใหม่: $URL"
if [ -z "${OAUTH_CLIENT_ID:-$EXISTING_CLIENT}" ]; then
  cat <<EOF
 เหลืออีก 1 ขั้น (ทำบนหน้าเว็บ ~3 นาที) — สร้างปุ่ม Sign in with Google:
  1) https://console.cloud.google.com/auth/branding?project=$PROJECT
     → Get started → ชื่อแอป Risk Register → Audience: Internal → Create
  2) https://console.cloud.google.com/auth/clients/create?project=$PROJECT
     → Web application → Authorized JavaScript origins: $URL → Create
  3) คัดลอก Client ID แล้วรัน:
     gcloud run services update $SERVICE --region $REGION --update-env-vars OAUTH_CLIENT_ID=<Client ID>
EOF
else
  echo " เปิด URL แล้ว Sign in with Google (@$DOMAIN) ได้เลย"
fi
echo " นำเข้า Google Sheet บน Cloud: แชร์ไฟล์ (Viewer) ให้ $SA ก่อน"
echo "════════════════════════════════════════════════════════"
