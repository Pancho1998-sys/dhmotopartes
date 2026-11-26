param(
    [string]$ConfigPath = ""
)

$ErrorActionPreference = "Stop"

if (-not $ConfigPath) {
    $candidates = @(
        "C:\DHMotopartes\backups\backup-config.json",
        (Join-Path $PSScriptRoot "backups\backup-config.json")
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { $ConfigPath = $c; break }
    }
}

if (-not $ConfigPath -or -not (Test-Path $ConfigPath)) {
    Write-Error "No se encontró backup-config.json. Configúralo primero."
    exit 1
}

$cfg = Get-Content -Path $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$today = Get-Date -Format "yyyy-MM-dd"
$nowStr = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

function Write-BackupLog {
    param([string]$Message)
    foreach ($dir in $cfg.backupDirs) {
        try {
            if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
            Add-Content -Path (Join-Path $dir "backup_log.txt") -Value "[$nowStr] $Message" -Encoding UTF8
        } catch {}
    }
}

# Reintentar hasta 3 veces por si la PC acaba de encender y aún conecta al Wi-Fi
$attempt = 0
$maxAttempts = 3
$success = $false

while ($attempt -lt $maxAttempts -and -not $success) {
    $attempt++
    try {
        $authBody = @{
            email = $cfg.email
            password = $cfg.password
        } | ConvertTo-Json -Compress

        $authRes = Invoke-RestMethod `
            -Uri "$($cfg.supabaseUrl)/auth/v1/token?grant_type=password" `
            -Method Post `
            -Headers @{ "apikey" = $cfg.anonKey; "Content-Type" = "application/json" } `
            -Body $authBody `
            -TimeoutSec 30

        $hdr = @{
            "apikey" = $cfg.anonKey
            "Authorization" = "Bearer $($authRes.access_token)"
        }

        $rows = Invoke-RestMethod `
            -Uri "$($cfg.supabaseUrl)/rest/v1/store_states?store_id=eq.$($cfg.storeId)&select=store_id,updated_at,state" `
            -Method Get `
            -Headers $hdr `
            -TimeoutSec 45

        if (-not $rows -or $rows.Count -eq 0 -or -not $rows[0].state) {
            throw "store_states no devolvió estado para $($cfg.storeId)"
        }

        $stateObj = $rows[0].state
        $prodCount = if ($stateObj.products) { @($stateObj.products).Count } else { 0 }
        $salesCount = if ($stateObj.sales) { @($stateObj.sales).Count } else { 0 }
        $custCount = if ($stateObj.customers) { @($stateObj.customers).Count } else { 0 }

        if ($prodCount -eq 0 -and $salesCount -eq 0 -and $custCount -eq 0) {
            Write-BackupLog "OMITIDO: El estado remoto estaba vacío (0 productos, 0 ventas, 0 clientes). No se sobrescribió el respaldo."
            Write-Warning "Estado remoto vacío; backup omitido por seguridad."
            exit 2
        }

        $jsonOut = $stateObj | ConvertTo-Json -Depth 100
        $fileName = "dhmotopartes_backup_$today.json"
        $keepCount = if ($cfg.keepDays) { [int]$cfg.keepDays } else { 90 }

        foreach ($dir in $cfg.backupDirs) {
            if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
            $targetPath = Join-Path $dir $fileName
            [System.IO.File]::WriteAllText($targetPath, $jsonOut, [System.Text.UTF8Encoding]::new($false))

            # Rotación manteniendo los últimos $keepCount backups diarios
            $allBackups = Get-ChildItem -Path $dir -Filter "dhmotopartes_backup_????-??-??.json" | Sort-Object Name
            if ($allBackups.Count -gt $keepCount) {
                $toDelete = $allBackups | Select-Object -First ($allBackups.Count - $keepCount)
                foreach ($old in $toDelete) {
                    Remove-Item -Path $old.FullName -Force -ErrorAction SilentlyContinue
                }
            }
        }

        $ver = if ($stateObj.version) { $stateObj.version } else { "?" }
        Write-BackupLog "OK: $fileName guardado (version=$ver, productos=$prodCount, ventas=$salesCount, clientes=$custCount)"
        Write-Host "Backup nocturno completado: $fileName (productos=$prodCount, ventas=$salesCount)"
        $success = $true
    } catch {
        if ($attempt -lt $maxAttempts) {
            Start-Sleep -Seconds 15
        } else {
            Write-BackupLog "ERROR tras $maxAttempts intentos: $($_.Exception.Message)"
            Write-Error $_.Exception.Message
            exit 1
        }
    }
}
