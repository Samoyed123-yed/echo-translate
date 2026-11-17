@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install_windows.ps1" -InstallPdf -InstallCodex
if errorlevel 1 (
  echo Installation did not finish. Read the error above or give INSTALL_FOR_AI.md to your local AI.
) else (
  echo Installation complete. Use the Echo Translate desktop shortcut.
)
pause
