@echo off
setlocal enabledelayedexpansion

set BLOG_DIR=%~dp0
set PROTOTYPE_ROOT=%BLOG_DIR%..\..
set GAMES_DIR=%BLOG_DIR%games

echo.
echo === Prototype Lab Blog Deploy ===
echo.

REM --- Step 1: Sync game files ---
echo [1/4] Syncing game files...

for /d %%S in ("%PROTOTYPE_ROOT%\Game\slot*") do (
    for /d %%G in ("%%S\game-*") do (
        if exist "%%G\deploy\index.html" (
            for %%F in ("%%G") do set GAME_FOLDER=%%~nxF
            set GAME_NAME=!GAME_FOLDER:game-=prototype!
            echo   Copying !GAME_NAME!...
            if not exist "%GAMES_DIR%\!GAME_NAME!" mkdir "%GAMES_DIR%\!GAME_NAME!"
            xcopy /s /y /q "%%G\deploy\*" "%GAMES_DIR%\!GAME_NAME!\" >nul 2>&1
        )
    )
)

REM --- Step 2: Build blog HTML ---
echo [2/4] Building blog HTML...
cd /d "%BLOG_DIR%"
node build-blog.js
if errorlevel 1 (
    echo ERROR: build-blog.js failed!
    pause
    exit /b 1
)

REM --- Step 3: Git commit ---
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
    echo   No changes to commit.
    goto :done
)

REM --- Step 4: Push ---
echo [4/4] Pushing to GitHub...
git push -u origin main

:done
echo.
echo === Done! Netlify will auto-deploy in ~10 seconds ===
echo    https://ariescar.netlify.app/
echo.
pause
