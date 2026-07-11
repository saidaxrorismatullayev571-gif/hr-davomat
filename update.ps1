# ============================================================
#  iMed HR bot - YANGILASH skripti (Windows)
#  Eng so'nggi kodni yuklaydi (.env va node_modules saqlanadi)
#  va botni qayta ishga tushiradi.
# ============================================================

Write-Host ""
Write-Host "=== iMed HR bot - kodni yangilash ===" -ForegroundColor Cyan

if (-not (Test-Path ".\package.json")) {
    Write-Host "XATO: Bot papkasida ishga tushiring." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path ".\.env")) {
    Write-Host "OGOHLANTIRISH: .env topilmadi. Avval setup.ps1 ni ishga tushiring." -ForegroundColor Yellow
}

$zipUrl = "https://github.com/saidaxrorismatullayev571-gif/hr-davomat/archive/refs/heads/main.zip"
$tmpZip = Join-Path $env:TEMP "hr-update.zip"
$tmpDir = Join-Path $env:TEMP "hr-update"

Write-Host "So'nggi kod yuklanmoqda..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $zipUrl -OutFile $tmpZip
if (Test-Path $tmpDir) { Remove-Item $tmpDir -Recurse -Force }
Expand-Archive -Path $tmpZip -DestinationPath $tmpDir -Force

$src = Join-Path $tmpDir "hr-davomat-main"

# Kod fayllarini almashtirish (.env va node_modules TEGILMAYDI)
if (Test-Path ".\src") { Remove-Item ".\src" -Recurse -Force }
Copy-Item (Join-Path $src "src") -Destination ".\src" -Recurse -Force
Copy-Item (Join-Path $src "package.json") -Destination ".\package.json" -Force
Copy-Item (Join-Path $src "tsconfig.json") -Destination ".\tsconfig.json" -Force

# Yangi kutubxona qo'shilgan bo'lishi mumkin
Write-Host "Kutubxonalar tekshirilmoqda (npm install)..." -ForegroundColor Cyan
npm install

Write-Host ""
Write-Host "Kod yangilandi. Bot ishga tushmoqda." -ForegroundColor Green
Write-Host "Bu oynani YOPMANG. To'xtatish: Ctrl+C." -ForegroundColor Yellow
Write-Host ""
npm run dev
