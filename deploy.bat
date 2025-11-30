@echo off
echo ========================================
echo  Deploy to GitHub
echo ========================================
echo.

REM 1. Initialize Git (if not exists)
if not exist .git (
    echo [1/6] Initializing git repository...
    git init
    if errorlevel 1 (
        echo ERROR: Git is not installed or not in PATH
        pause
        exit /b 1
    )
) else (
    echo [1/6] Git repository already initialized
)

REM 2. Add remote
echo [2/6] Adding remote repository...
git remote remove origin 2>nul
git remote add origin https://github.com/Chiraphong20/checkin.git
if errorlevel 1 (
    echo ERROR: Failed to add remote
    pause
    exit /b 1
)

REM 3. Check .gitignore
if not exist .gitignore (
    echo ERROR: .gitignore not found!
    pause
    exit /b 1
)

REM 4. Add files
echo [3/6] Adding files to git...
git add .
if errorlevel 1 (
    echo ERROR: Failed to add files
    pause
    exit /b 1
)

REM 5. Commit
echo [4/6] Committing changes...
git commit -m "Initial commit: Employee Check-in System"
if errorlevel 1 (
    echo WARNING: Nothing to commit or commit failed
)

REM 6. Set branch
echo [5/6] Setting up main branch...
git branch -M main

REM 7. Push
echo [6/6] Pushing to GitHub...
echo.
echo NOTE: You may need to authenticate with GitHub
echo.
git push -u origin main

if errorlevel 1 (
    echo.
    echo ========================================
    echo  ERROR: Failed to push to GitHub
    echo ========================================
    echo.
    echo Possible solutions:
    echo 1. Check your GitHub credentials
    echo 2. Use Personal Access Token instead of password
    echo 3. Check repository permissions
    echo.
    echo See DEPLOY.md for more information
    echo.
) else (
    echo.
    echo ========================================
    echo  SUCCESS: Deployed to GitHub!
    echo ========================================
    echo.
    echo Repository: https://github.com/Chiraphong20/checkin.git
    echo.
)

pause










