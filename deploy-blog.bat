@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

set BLOG_DIR=%~dp0
set PROTOTYPE_ROOT=%BLOG_DIR%..\..
set GAMES_DIR=%BLOG_DIR%games

echo.
echo ============================================
echo   Prototype Lab Blog Deploy
echo ============================================
echo.

REM ─── Parse mode argument ───
REM Usage:
REM   deploy-blog.bat              ← default: GitHub path (premium)
REM   deploy-blog.bat --github     ← explicit: GitHub → Netlify auto-deploy
REM   deploy-blog.bat --netlify    ← direct: Netlify CLI deploy (no git)
REM   deploy-blog.bat --build-only ← sync + build only, no deploy

set DEPLOY_MODE=github
for %%a in (%*) do (
    if "%%a"=="--netlify" set DEPLOY_MODE=netlify
    if "%%a"=="--github"  set DEPLOY_MODE=github
    if "%%a"=="--build-only" set DEPLOY_MODE=build-only
)

echo   Mode: %DEPLOY_MODE%
echo.

REM ─── Step 1: Sync game deploy/ folders → blog/games/ ───
echo [1/4] Syncing game files...
cd /d "%BLOG_DIR%"
node sync-games.mjs
if errorlevel 1 (
    echo ERROR: sync-games.mjs failed!
    pause
    exit /b 1
)

REM ─── Step 2: Build blog HTML (index.html + prototype.html + posts + sitemap) ───
echo [2/4] Building blog HTML...
cd /d "%BLOG_DIR%"
node build-blog.js
if errorlevel 1 (
    echo ERROR: build-blog.js failed!
    pause
    exit /b 1
)

REM ─── Build-only stops here ───
if "%DEPLOY_MODE%"=="build-only" (
    echo.
    echo === Build complete (no deploy) ===
    echo.
    pause
    exit /b 0
)

REM ─── Path A: GitHub → Netlify auto-deploy ───
if "%DEPLOY_MODE%"=="github" (
    echo [3/4] Committing changes...
    cd /d "%BLOG_DIR%"

    if not exist ".git" (
        echo   First time setup - initializing git...
        git init
        git remote add origin https://github.com/ariescar0326-sketch/prototype-lab.git
        git branch -M main
    )

    git config user.name "ariescar0326-sketch"
    git config user.email "ariescar0326@gmail.com"
    git add -A
    git commit -m "blog: update %date:~0,10%" 2>nul
    if errorlevel 1 (
        echo   No new changes to commit.
    ) else (
        echo   Committed.
    )

    echo [4/4] Pushing to GitHub...
    git push -u origin main

    echo.
    echo === Done! Netlify will auto-deploy in ~10 seconds ===
    echo    https://ariescar.netlify.app/
    echo.
    pause
    exit /b 0
)

REM ─── Path B: Direct Netlify CLI deploy ───
if "%DEPLOY_MODE%"=="netlify" (
    echo [3/4] Checking Netlify CLI...
    where netlify >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Netlify CLI not found.
        echo   npm install -g netlify-cli
        echo   netlify login
        pause
        exit /b 1
    )

    echo [4/4] Deploying to Netlify directly...
    cd /d "%BLOG_DIR%"
    netlify deploy --prod --dir=. --site-name=ariescar

    echo.
    echo === Done! Site is live ===
    echo    https://ariescar.netlify.app/
    echo.
    pause
    exit /b 0
)
