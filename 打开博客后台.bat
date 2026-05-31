@echo off
chcp 65001 >nul
setlocal
set "ROOT=%~dp0"
cd /d "%ROOT%"
title 打开博客后台

echo ========================================
echo   正在启动博客后台和本地预览
echo ========================================
echo.

if not exist "%ROOT%package.json" (
  echo 找不到 package.json，请确认这个文件在博客项目根目录。
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo 没有找到 npm，请先安装 Node.js。
  pause
  exit /b 1
)

echo 1/4 正在启动博客后台服务...
start "博客后台服务" powershell.exe -NoProfile -ExecutionPolicy Bypass -NoExit -Command "Set-Location -LiteralPath '%ROOT%'; npm run admin"

echo 2/4 等待后台真正启动...
for /l %%i in (1,1,20) do (
  powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5050/api/ping' -TimeoutSec 1; if ($r.StatusCode -eq 200) { exit 0 } } catch { exit 1 }" >nul 2>nul
  if not errorlevel 1 goto admin_ready
  timeout /t 1 /nobreak >nul
)

echo 后台启动可能失败，请查看“博客后台服务”窗口里的报错。
echo 常见原因：端口 5050 被占用、依赖没安装、npm 命令失败。
pause
exit /b 1

:admin_ready
echo 后台已启动。
start "" "http://127.0.0.1:5050/"

echo 3/4 正在启动本地预览服务...
start "博客本地预览" powershell.exe -NoProfile -ExecutionPolicy Bypass -NoExit -Command "Set-Location -LiteralPath '%ROOT%'; npm run server"

echo 4/4 等待预览启动...
timeout /t 7 /nobreak >nul
start "" "http://localhost:4000/boke/"

echo.
echo 已经打开：
echo   后台：http://127.0.0.1:5050/
echo   预览：http://localhost:4000/boke/
echo.
echo 默认后台密码：admin123
echo 保存个人信息失败时，请先确认“博客后台服务”窗口没有被关闭。
echo.
pause
