@echo off
cd /d "%~dp0"
if not exist node_modules call npm.cmd ci
if errorlevel 1 exit /b 1
call npm.cmd run build
if errorlevel 1 exit /b 1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch.ps1"
