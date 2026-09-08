@echo off
setlocal
cd /d "%~dp0platform\frontend"

where npm >nul 2>&1
if errorlevel 1 (
  goto :missing_npm
)

if not exist "node_modules\.bin\next.cmd" (
  echo Frontend dependencies are missing. Installing them...
  call npm install || goto :error
)

echo.
echo Starting frontend at http://localhost:3000
echo Press Ctrl+C to stop it.
echo.
call npm run dev
if errorlevel 1 goto :error
exit /b 0

:missing_npm
echo.
echo npm was not found. Install Node.js and make sure npm is available in PATH.
pause
exit /b 1

:error
echo.
echo The frontend failed to start. Review the error above.
pause
exit /b 1
