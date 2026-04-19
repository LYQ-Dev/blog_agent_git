@echo off
title Elysia 学习笔记服务
mode con cols=80 lines=10

:: 启动后端服务
start /B node server.js

:: 等待 1.5 秒确保服务启动
timeout /t 1 /nobreak >nul

:: 打开正确路径的网页（public/index.html）
start "" "%~dp0public\index.html"

:: 等待浏览器关闭
:loop
tasklist | find /i "chrome.exe" >nul && (
    timeout /t 1 /nobreak >nul
    goto loop
)

tasklist | find /i "msedge.exe" >nul && (
    timeout /t 1 /nobreak >nul
    goto loop
)

:: 关闭服务并退出
taskkill /f /im node.exe >nul 2>&1
exit