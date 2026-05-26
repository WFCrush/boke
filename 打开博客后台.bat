@echo off
chcp 65001 > nul
title 博客管理后台
cd /d "%~dp0"

echo.
echo ========================================
echo   正在启动博客管理后台...
echo ========================================
echo.
echo   稍等几秒，浏览器会自动打开
echo   默认密码：admin123
echo.
echo   关闭这个黑窗口 = 关闭后台
echo ========================================
echo.

start "" "http://127.0.0.1:5050"
call npm run admin

pause
