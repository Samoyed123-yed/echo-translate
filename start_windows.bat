@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 server.py
) else (
  python server.py
)
if errorlevel 1 (
  echo.
  echo [Echo Translate] Please install Python 3.10+ and retry.
  echo https://www.python.org/downloads/windows/
  pause
)
