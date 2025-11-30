# Script สำหรับ deploy โปรเจกต์ขึ้น GitHub

Write-Host "🚀 Starting deployment to GitHub..." -ForegroundColor Green

# 1. ตรวจสอบว่าเป็น git repository หรือไม่
if (-not (Test-Path .git)) {
    Write-Host "📦 Initializing git repository..." -ForegroundColor Yellow
    git init
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Error: Git is not installed or not in PATH" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "✅ Git repository already initialized" -ForegroundColor Green
}

# 2. เพิ่ม remote repository
Write-Host "🔗 Adding remote repository..." -ForegroundColor Yellow
git remote remove origin 2>$null
git remote add origin https://github.com/Chiraphong20/checkin.git

# 3. ตรวจสอบว่า .gitignore มีอยู่
if (-not (Test-Path .gitignore)) {
    Write-Host "⚠️  Warning: .gitignore not found!" -ForegroundColor Red
    exit 1
}

# 4. เพิ่มไฟล์ทั้งหมด
Write-Host "📝 Adding files to git..." -ForegroundColor Yellow
git add .

# 5. Commit
Write-Host "💾 Committing changes..." -ForegroundColor Yellow
git commit -m "Initial commit: Employee Check-in System"

# 6. ตั้งค่า branch เป็น main
Write-Host "🌿 Setting up main branch..." -ForegroundColor Yellow
git branch -M main

# 7. Push ขึ้น GitHub
Write-Host "🚀 Pushing to GitHub..." -ForegroundColor Yellow
Write-Host "⚠️  You may need to authenticate with GitHub" -ForegroundColor Yellow
git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Successfully deployed to GitHub!" -ForegroundColor Green
    Write-Host "🔗 Repository: https://github.com/Chiraphong20/checkin.git" -ForegroundColor Cyan
} else {
    Write-Host "❌ Error pushing to GitHub. Please check your authentication." -ForegroundColor Red
    Write-Host "💡 You may need to:" -ForegroundColor Yellow
    Write-Host "   1. Set up GitHub credentials" -ForegroundColor Yellow
    Write-Host "   2. Use GitHub Personal Access Token" -ForegroundColor Yellow
    Write-Host "   3. Or use SSH key for authentication" -ForegroundColor Yellow
}







