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

$EmptyDb = Join-Path $TempDir "dhmotopartes_db.json"
Set-Content -Path $EmptyDb -Value "{}" -Encoding UTF8
Write-Host "  OK  dhmotopartes_db.json (base de datos vacia para cliente nuevo)" -ForegroundColor Green

$ReadmeLines = @(
    "DHMotopartes - Instrucciones de instalacion",
    "",
    "1. Copia TODA esta carpeta a la PC donde quieras usar el sistema",
    "2. Haz doble clic en DHMotopartes-Server.exe",
    "3. Se abre el navegador automaticamente con el sistema listo",
    "4. Para trabajar sin internet, elige 'Trabajar sin Conexion (Modo Local)'",
    "",
    "Acceso desde celular o tablet:",
    "Una vez iniciado el servidor, podes acceder desde cualquier dispositivo",
    "en la misma red Wi-Fi usando la IP que aparece en la consola del servidor.",
    "Ejemplo: http://192.168.1.X:8000/",
    "",
    "Requisitos: Windows 10/11 de 64 bits. Sin instalaciones adicionales.",
    "",
    "Version del paquete: $Version"
)
Set-Content -Path (Join-Path $TempDir "LEEME.txt") -Value $ReadmeLines -Encoding UTF8
Write-Host "  OK  LEEME.txt" -ForegroundColor Green

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
