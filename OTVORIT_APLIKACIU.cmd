@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

where py >nul 2>nul
if not errorlevel 1 goto run_py

where python >nul 2>nul
if not errorlevel 1 goto run_python

echo.
echo Aplikaciu sa nepodarilo spustit, pretoze Windows nenasiel Python.
echo Nainstalujte Python alebo aplikaciu spustite podla navodu v README.md.
set "EXIT_CODE=1"
goto finish

:run_py
py -3 launcher.py
set "EXIT_CODE=%ERRORLEVEL%"
goto finish

:run_python
python launcher.py
set "EXIT_CODE=%ERRORLEVEL%"

:finish
if "%REPLIKA_LAUNCHER_TEST%"=="1" exit /b %EXIT_CODE%
if not "%EXIT_CODE%"=="0" pause
exit /b %EXIT_CODE%
