@echo off
setlocal
cd /d "%~dp0"
call npm run app:start
if errorlevel 1 (
  echo.
  echo 袜厂进销存ERP管理系统启动失败，请确认已经安装 Node.js 22 或更高版本。
  pause
)
endlocal
