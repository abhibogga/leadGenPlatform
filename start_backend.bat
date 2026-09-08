@echo off
setlocal
cd /d "%~dp0platform\backend"

where py >nul 2>&1
if %errorlevel%==0 (
  set "PYTHON_CMD=py"
) else (
  set "PYTHON_CMD=python"
)

if not exist ".venv\Scripts\python.exe" (
  echo Creating backend Python virtual environment...
  %PYTHON_CMD% -m venv .venv || goto :error
)

echo Installing backend dependencies...
".venv\Scripts\python.exe" -m pip install -r requirements.txt || goto :error

echo.
echo Starting backend at http://127.0.0.1:8000
echo API documentation: http://127.0.0.1:8000/docs
echo Press Ctrl+C to stop it.
echo.
".venv\Scripts\python.exe" -m uvicorn app.main:app --reload --port 8000
if errorlevel 1 goto :error
exit /b 0

:error
echo.
echo The backend failed to start. Review the error above.
pause
exit /b 1
