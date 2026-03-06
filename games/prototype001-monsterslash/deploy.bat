@echo off
chcp 65001 >nul
echo ========================================
echo   Monster Slash - GitHub Pages Deploy
echo ========================================
echo.
where gh >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] gh CLI not found! Open a NEW CMD window and try again.
    echo If not installed: https://cli.github.com/
    pause
    exit /b 1
)
echo [0/4] Cleaning up old repo...
gh repo delete ariescar0326-sketch/prototype-monsterslash --yes 2>nul
set TEMP_DEPLOY=%TEMP%\prototype001-monsterslash
if exist "%TEMP_DEPLOY%" rmdir /s /q "%TEMP_DEPLOY%"
mkdir "%TEMP_DEPLOY%"
xcopy /s /e /q "%~dp0*.*" "%TEMP_DEPLOY%\" >nul
cd /d "%TEMP_DEPLOY%"
del deploy.bat 2>nul
echo [1/4] Initializing git...
git init
git branch -m main
git add .
git commit -m "MVP: Monster Slash prototype"
echo.
echo [2/4] Creating repo and pushing...
gh repo create prototype001-monsterslash --public --description "Monster Slash - Swipe to Slash! 3D mobile browser game." --source=. --push
if %errorlevel% neq 0 (
    echo [WARN] Repo may exist. Trying push...
    git remote remove origin 2>nul
    git remote add origin https://github.com/ariescar0326-sketch/prototype001-monsterslash.git
    git push -u origin main --force
)
echo.
echo [3/4] Enabling GitHub Pages...
timeout /t 5 >nul
gh api repos/ariescar0326-sketch/prototype001-monsterslash/pages -X POST -f "source[branch]=main" -f "source[path]=/" 2>nul
echo.
echo [4/4] Adding topics...
gh repo edit ariescar0326-sketch/prototype001-monsterslash --add-topic threejs --add-topic game --add-topic prototype 2>nul
echo.
echo ========================================
echo   DONE!
echo   https://ariescar0326-sketch.github.io/prototype001-monsterslash/
echo ========================================
pause
