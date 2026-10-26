@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

set "PATH=%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%APPDATA%\nvm;%PATH%"

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo [錯誤] 找不到 Node.js。
  echo 請先安裝 18.17 或以上版本：https://nodejs.org
  echo.
  pause
  exit /b 1
)

echo 正在啟動 Hailuo SplitKit…
echo 關閉此視窗即停止服務。
echo.
node scripts\launch.js
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)
