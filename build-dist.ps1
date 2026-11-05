$RepoDir  = $PSScriptRoot
$Version  = (Get-Date -Format "yyyy-MM-dd")
$ZipName  = "DHMotopartes-$Version.zip"
$ZipPath  = Join-Path $RepoDir $ZipName
$TempDir  = Join-Path $env:TEMP "DHMotopartes-dist-temp"

$Files = @(
    "DHMotopartes-Server.exe",
    "index.html",
    "app.js",
    "components.js",
    "fiscal.js",
    "style.css",
    "supabase-config.js",
    "xlsx.full.min.js"
)

Write-Host ""
Write-Host "======================================================"
Write-Host "  DHMotopartes - Generador de paquete de distribucion"
Write-Host "======================================================"
Write-Host ""

if (-not (Test-Path (Join-Path $RepoDir "DHMotopartes-Server.exe"))) {
    Write-Host "ERROR: No se encontro DHMotopartes-Server.exe" -ForegroundColor Red
    exit 1
}

if (Test-Path $TempDir) { Remove-Item $TempDir -Recurse -Force }
New-Item -ItemType Directory -Path $TempDir | Out-Null

Write-Host "  Copiando archivos..." -ForegroundColor Cyan
foreach ($file in $Files) {
    $src = Join-Path $RepoDir $file
    if (Test-Path $src) {
        Copy-Item $src $TempDir
        $sizeKB = [math]::Round((Get-Item $src).Length / 1KB, 1)
        Write-Host ("  OK  " + $file + " (" + $sizeKB + " KB)") -ForegroundColor Green
    } else {
        Write-Host ("  WARN: No se encontro " + $file + " - omitido") -ForegroundColor Yellow
    }
}

# Base de datos vacia para clientes nuevos
$EmptyDb = Join-Path $TempDir "dhmotopartes_db.json"
Set-Content -Path $EmptyDb -Value "{}" -Encoding UTF8
Write-Host "  OK  dhmotopartes_db.json (base de datos vacia para cliente nuevo)" -ForegroundColor Green

# -------------------------------------------------------
# Generar actualizar.bat — para clientes que ya tienen
# el sistema instalado y solo quieren actualizar archivos
# -------------------------------------------------------
$ActualizarBat = @'
@echo off
title DHMotopartes - Actualizador
echo.
echo ======================================================
echo   DHMotopartes - Actualizador de version
echo ======================================================
echo.
echo Este script actualiza los archivos del sistema
echo SIN borrar tu base de datos (ventas, productos, etc).
echo.
set /p DEST=Escribe la ruta donde esta instalado DHMotopartes (ej: C:\DHMotopartes): 
echo.

if not exist "%DEST%" (
    echo ERROR: La carpeta "%DEST%" no existe.
    pause
    exit /b 1
)

if not exist "%DEST%\DHMotopartes-Server.exe" (
    echo ERROR: No se encontro DHMotopartes-Server.exe en "%DEST%".
    echo Verifica que sea la carpeta correcta de instalacion.
    pause
    exit /b 1
)

echo Actualizando archivos...
set SRC=%~dp0

for %%f in (DHMotopartes-Server.exe index.html app.js components.js fiscal.js style.css supabase-config.js xlsx.full.min.js) do (
    if exist "%SRC%%%f" (
        copy /y "%SRC%%%f" "%DEST%\%%f" >nul
        echo   OK  %%f
    )
)

echo.
echo ======================================================
echo   Actualizacion completada exitosamente!
echo   Tu base de datos NO fue modificada.
echo   Ya podes abrir DHMotopartes-Server.exe normalmente.
echo ======================================================
echo.
pause
'@

Set-Content -Path (Join-Path $TempDir "actualizar.bat") -Value $ActualizarBat -Encoding ASCII
Write-Host "  OK  actualizar.bat (actualizador para clientes existentes)" -ForegroundColor Green

# LEEME.txt
$ReadmeLines = @(
    "DHMotopartes - Instrucciones",
    "============================",
    "",
    "--- INSTALACION NUEVA ---",
    "1. Copia TODA esta carpeta a la PC (Escritorio, Documentos, etc.)",
    "2. Haz doble clic en DHMotopartes-Server.exe",
    "3. Se abre el navegador automaticamente",
    "4. Elige 'Trabajar sin Conexion (Modo Local)'",
    "",
    "--- ACTUALIZACION (ya tenes el sistema instalado) ---",
    "1. Extrae este ZIP en cualquier carpeta temporal",
    "2. Ejecuta actualizar.bat",
    "3. Cuando te pida la ruta, escribe donde esta instalado DHMotopartes",
    "   Ejemplo: C:\DHMotopartes",
    "4. El script actualiza los archivos SIN tocar tu base de datos",
    "",
    "--- ACCESO DESDE CELULAR / TABLET ---",
    "Con el servidor corriendo, entra desde cualquier dispositivo",
    "en la misma red Wi-Fi usando la IP que aparece en la consola.",
    "Ejemplo: http://192.168.1.X:8000/",
    "",
    "Requisitos: Windows 10/11 de 64 bits. Sin instalaciones adicionales.",
    "",
    "Version: $Version"
)
Set-Content -Path (Join-Path $TempDir "LEEME.txt") -Value $ReadmeLines -Encoding UTF8
Write-Host "  OK  LEEME.txt" -ForegroundColor Green

# Eliminar zip anterior y comprimir
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }

Write-Host ""
Write-Host ("  Comprimiendo en " + $ZipName + " ...") -ForegroundColor Cyan
Compress-Archive -Path "$TempDir\*" -DestinationPath $ZipPath -CompressionLevel Optimal

Remove-Item $TempDir -Recurse -Force

$sizeMB = [math]::Round((Get-Item $ZipPath).Length / 1MB, 2)
Write-Host ""
Write-Host "======================================================"
Write-Host ("  LISTO: " + $ZipName + " (" + $sizeMB + " MB)") -ForegroundColor Green
Write-Host ("  Ubicacion: " + $ZipPath) -ForegroundColor Green
Write-Host "======================================================"
Write-Host ""
Write-Host "  - Clientes NUEVOS:      extraen el ZIP y ejecutan DHMotopartes-Server.exe"
Write-Host "  - Clientes existentes:  extraen el ZIP y ejecutan actualizar.bat"
Write-Host ""
