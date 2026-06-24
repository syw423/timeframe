@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo =======================================
echo   TimeFrame v2 — 本地服务器启动
echo =======================================
echo.
echo 端口: 8000
echo 地址: http://localhost:8000
echo.
echo 按 Ctrl+C 关闭服务器
echo =======================================
echo.
python -m http.server 8000
if %errorlevel% neq 0 (
    echo Python 未找到，尝试 Node.js...
    npx http-server -p 8000 --cors
)
pause
