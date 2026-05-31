@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 打开博客后台
echo 正在打开博客工作台...
echo.
echo 请选择 1：同时打开后台和本地预览。
echo 如果只是改文章，也可以选 2：只打开后台。
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\blog-workbench.ps1"
pause
