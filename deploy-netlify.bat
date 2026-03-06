@echo off
chcp 65001 >nul
echo.
echo ============================================
echo   Prototype Lab Blog - Netlify Deploy
echo ============================================
echo.

REM === 前置檢查 ===
where netlify >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Netlify CLI not found.
    echo.
    echo Please install it first:
    echo   npm install -g netlify-cli
    echo.
    echo Then login:
    echo   netlify login
    echo.
    pause
    exit /b 1
)

REM === 部署 ===
echo Deploying blog to Netlify...
echo.

REM 第一次部署會要求建立新 site，之後會記住
netlify deploy --prod --dir=. --site-name=ariescar

echo.
echo ============================================
echo   Deploy complete!
echo   Site: https://ariescar.netlify.app
echo ============================================
echo.
pause
