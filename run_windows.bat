@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>&1
if %errorlevel%==0 (
  set PY=py
) else (
  set PY=python
)

if not exist .venv (
  echo Creating Python virtual environment...
  %PY% -m venv .venv || goto :error
)

call .venv\Scripts\activate.bat || goto :error
python -m pip install -q --upgrade pip
pip install -q -r requirements.txt || goto :error

if not exist .env (
  copy .env.example .env >nul
  echo.
  echo Created .env. Open it and paste your OPENAI_API_KEY, then run this file again.
  echo.
  pause
  exit /b 0
)

if exist contacts_filled.xlsx (
  echo Using contacts from contacts_filled.xlsx...
  python reverse_boolean.py --contacts contacts_filled.xlsx
) else if exist contacts.xlsx (
  echo Using contacts from contacts.xlsx...
  python reverse_boolean.py --contacts contacts.xlsx
) else (
  python reverse_boolean.py
)
if errorlevel 1 goto :error
pause
exit /b 0

:error
echo.
echo Something failed. Read the error above.
pause
exit /b 1
