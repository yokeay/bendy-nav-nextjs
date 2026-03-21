@echo off
chcp 65001 >nul
title 定时关机脚本

echo ==================================================
echo  定时关机 — 60 秒后自动执行
echo ==================================================
echo.
echo  将关闭以下程序：
echo    - QQ
echo    - 微信 (WeChat)
echo    - Trae
echo    - Codex
echo.
echo  按 Ctrl+C 可取消
echo ==================================================

:: ── 倒计时 60 秒 ──────────────────────────────────────
for /l %%i in (60,-1,1) do (
    title 定时关机 — %%i 秒后执行
    echo [INFO] 剩余 %%i 秒...
    timeout /t 1 /nobreak >nul
)
echo.

:: ── 关闭 QQ ───────────────────────────────────────────
echo [INFO] 正在关闭 QQ...
taskkill /f /im QQ.exe >nul 2>&1 && echo [OK]   QQ 已关闭 || echo [SKIP] QQ 未运行
taskkill /f /im QQScLauncher.exe >nul 2>&1

:: ── 关闭 微信 ─────────────────────────────────────────
echo [INFO] 正在关闭 微信...
taskkill /f /im WeChat.exe >nul 2>&1 && echo [OK]   微信 已关闭 || echo [SKIP] 微信 未运行
taskkill /f /im WeChatApp.exe >nul 2>&1

:: ── 关闭 Trae ─────────────────────────────────────────
echo [INFO] 正在关闭 Trae...
taskkill /f /im Trae.exe >nul 2>&1 && echo [OK]   Trae 已关闭 || echo [SKIP] Trae 未运行

:: ── 关闭 Codex ────────────────────────────────────────
echo [INFO] 正在关闭 Codex...
taskkill /f /im Codex.exe >nul 2>&1 && echo [OK]   Codex 已关闭 || echo [SKIP] Codex 未运行

:: ── 等待进程完全退出 ──────────────────────────────────
timeout /t 3 /nobreak >nul

:: ── 强制关机 ──────────────────────────────────────────
echo.
echo [INFO] 正在强制关机...
shutdown /s /f /t 0

exit