@echo off
chcp 65001 >nul
echo ============================================
echo  Sky Roller - Deploy (Netlify first, then GitHub)
echo ============================================
echo.

REM === PHASE 1: Deploy to Netlify (safe, can repeat) ===
echo [PHASE 1] Deploying to Netlify...
echo.
cd /d "C:\Users\User\Desktop\Prototype\templates\blog"
netlify deploy --prod --dir=.
echo.
echo ============================================
echo  Netlify deployed!
echo  Check: https://sage-malabi-e0dfd7.netlify.app/games/prototype002-skyroller/
echo ============================================
echo.
echo Please verify the game on Netlify.
echo If everything looks good, press any key to continue to GitHub deploy.
echo If NOT good, close this window and fix first.
echo.
pause

REM === PHASE 2: Deploy to GitHub (careful, one shot) ===
echo.
echo [PHASE 2] Preparing GitHub deploy...
echo.

set SLUG=prototype002-skyroller
set TEMP_DIR=%TEMP%\%SLUG%
set DEPLOY_SRC=C:\Users\User\Desktop\Prototype\Game\slot002\game-002-skyroller\deploy

if exist "%TEMP_DIR%" rmdir /s /q "%TEMP_DIR%"
mkdir "%TEMP_DIR%"

echo Copying files...
xcopy /E /I /Y "%DEPLOY_SRC%\*" "%TEMP_DIR%" >nul
del "%TEMP_DIR%\deploy.bat" >nul 2>&1

echo Setting git config...
cd /d "%TEMP_DIR%"
git init
git config user.name "ariescar0326"
git config user.email "ariescar0326@gmail.com"
git add -A
git commit -m "Sky Roller - 7-player ball race prototype #002"

echo Pushing to GitHub...
gh repo create %SLUG% --public --source=. --push

echo.
echo ============================================
echo  GitHub deployed!
echo ============================================
echo.
echo Next steps (manual, on GitHub website):
echo   1. Go to https://github.com/ariescar0326-sketch/%SLUG%/settings/pages
echo   2. Branch: main / root
echo   3. Click Save
echo   4. Wait 1-2 min, then visit:
echo      https://ariescar0326-sketch.github.io/%SLUG%/
echo.
pause
