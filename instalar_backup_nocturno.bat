@echo off
title DHMotopartes - Instalar Backup Nocturno Automatico
echo.
echo ============================================================
echo   DHMotopartes - Instalador de Backup Nocturno Automatico
echo ============================================================
echo.

set DEST=C:\DHMotopartes
if not exist "%DEST%" mkdir "%DEST%"
if not exist "%DEST%\backups" mkdir "%DEST%\backups"

if exist "%~dp0backup_nocturno.ps1" (
    copy /y "%~dp0backup_nocturno.ps1" "%DEST%\backup_nocturno.ps1" >nul
    echo   OK  backup_nocturno.ps1 copiado a %DEST%
) else (
    echo   ERROR: No se encontro backup_nocturno.ps1
    pause
    exit /b 1
)

echo.
echo Registrando tarea programada diaria a las 22:00 hs...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"C:\DHMotopartes\backup_nocturno.ps1\"';" ^
  "$trigger = New-ScheduledTaskTrigger -Daily -At 22:00;" ^
  "$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10);" ^
  "Register-ScheduledTask -TaskName 'DHMotopartes-Backup-Nocturno' -Action $action -Trigger $trigger -Settings $settings -Description 'Respaldo diario nocturno de DH Motopartes desde Supabase' -Force | Out-Null"

if %errorlevel% equ 0 (
    echo   OK  Tarea programada "DHMotopartes-Backup-Nocturno" creada ^(22:00 todos los dias, con recuperacion si la PC estaba apagada^)
) else (
    echo   WARN: No se pudo registrar la tarea programada automaticamente.
)

echo.
echo Ejecutando primera prueba de respaldo...
powershell -NoProfile -ExecutionPolicy Bypass -File "%DEST%\backup_nocturno.ps1"
echo.
pause
