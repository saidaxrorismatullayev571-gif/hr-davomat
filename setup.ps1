# ============================================================
#  iMed HR bot — TEST sozlash skripti (Windows)
#  .env faylni avtomatik yozadi va botni ishga tushiradi.
#  Kalit git orqali buzilmasdan keladi — qo'lda nusxalash shart emas.
# ============================================================

Write-Host ""
Write-Host "=== iMed HR bot — sozlash ===" -ForegroundColor Cyan
Write-Host ""

# package.json shu papkada bo'lishi kerak
if (-not (Test-Path ".\package.json")) {
    Write-Host "XATO: package.json topilmadi. Bot papkasida ishga tushiring." -ForegroundColor Red
    Write-Host "Masalan: cd C:\Users\Noutbukcom\hr-davomat-main\hr-davomat-main" -ForegroundColor Yellow
    exit 1
}

# Bot tokenini so'rash (qisqa — nusxalasa buzilmaydi)
$botToken = Read-Host "Bot tokenini kiriting (@BotFather dan olingan)"
if ([string]::IsNullOrWhiteSpace($botToken)) {
    Write-Host "XATO: Bot token bo'sh bo'lmasligi kerak." -ForegroundColor Red
    exit 1
}
$botToken = $botToken.Trim()

# Supabase (iMed HR) — anon kalit shu skriptga birga keladi, buzilmaydi.
# Bu TEST kaliti (RLS himoyalangan). Production'da service_role qo'yiladi.
$supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlY2hwdWFlY2N5bmZ2ZmloZHJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2Nzc2NzgsImV4cCI6MjA5OTI1MzY3OH0.D4q5w1nBXmm1LN_FX3fyjlxj6J1tW5BhwX-67cJPTxs"

$lines = @(
    "BOT_TOKEN=$botToken",
    "SUPABASE_URL=https://qechpuaeccynfvfihdrk.supabase.co",
    "SUPABASE_SERVICE_KEY=$supabaseKey",
    "GROUP_CHAT_ID=-1003966396343",
    "GROUP_CHAT_ID_2=-1003987794980",
    "GROUP_TOPIC_ID_2=3393"
)

Set-Content -Path ".env" -Value $lines -Encoding ascii
Write-Host ""
Write-Host ".env yaratildi:" -ForegroundColor Green
Get-Content ".env" | ForEach-Object {
    if ($_ -like "BOT_TOKEN=*") { "BOT_TOKEN=***" } else { $_ }
}

# node_modules yo'q bo'lsa — o'rnatish
if (-not (Test-Path ".\node_modules")) {
    Write-Host ""
    Write-Host "Kutubxonalar o'rnatilmoqda (npm install)..." -ForegroundColor Cyan
    npm install
}

Write-Host ""
Write-Host "Bot ishga tushmoqda. Telegram'da /start yuboring." -ForegroundColor Cyan
Write-Host "To'xtatish: Ctrl+C. Bu oynani YOPMANG." -ForegroundColor Yellow
Write-Host ""
npm run dev
