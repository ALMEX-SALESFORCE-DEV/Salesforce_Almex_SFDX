<#
.SYNOPSIS
    Retrieve dividido de PROD por sub-manifiestos (evita OOM del Node heap).

.DESCRIPTION
    Parte manifest/package.xml en N sub-manifiestos:
      - Tipos "pesados" (CustomField, CustomObject, Layout, Flow, etc.) van SOLOS.
      - El resto se agrupa en lotes de -ChunkSize tipos.
    Cada sub-manifiesto se baja con `sf project retrieve start --manifest`
    con el heap de Node elevado y continue-on-error + log.

    Flujo inverso prod -> repo. NO despliega. Ver docs/07-sync-prod-a-main.md.

.PARAMETER Org
    Alias del org. Default: ALMEX-Production.

.PARAMETER HeapMB
    Tamanio de heap de Node en MB. Default: 8192 (usa 12288 si tienes 16GB+ RAM).

.PARAMETER ChunkSize
    Tipos no-pesados por lote. Default: 10.

.PARAMETER Manifest
    Ruta al package.xml. Default: manifest/package.xml.

.PARAMETER PauseIndexer
    Detiene el servicio Windows Search (WSearch) durante el retrieve y lo reinicia
    al terminar. El indexer mapea en memoria los .xml bajo Documents y choca con la
    reescritura de sf ("UNKNOWN: unknown error, open ...object-meta.xml"). REQUIERE
    shell elevado (admin). Alternativa permanente sin admin: excluir el repo del
    indexado con  attrib +I <repo> /S /D.

.EXAMPLE
    ./scripts/sync-prod-retrieve.ps1
    ./scripts/sync-prod-retrieve.ps1 -HeapMB 12288 -ChunkSize 6 -PauseIndexer
#>
[CmdletBinding()]
param(
    [string]$Org              = "ALMEX-Production",
    [int]   $HeapMB           = 8192,
    [int]   $ChunkSize        = 10,
    [int]   $HeavyMemberChunk = 25,
    [int]   $Retries          = 2,
    [switch]$PauseIndexer,
    [string]$Manifest         = "manifest/package.xml"
)

$ErrorActionPreference = "Stop"

# Pausa el indexer de Windows si se pidio (y si corremos elevados).
$indexerPaused = $false
if ($PauseIndexer) {
    $ws = Get-Service WSearch -ErrorAction SilentlyContinue
    if ($ws -and $ws.Status -eq 'Running') {
        try {
            Stop-Service WSearch -Force -ErrorAction Stop
            $indexerPaused = $true
            Write-Host "WSearch detenido (se reinicia al terminar)." -ForegroundColor Cyan
        } catch {
            Write-Host "No se pudo detener WSearch (necesitas shell admin). Sigo sin pausar: $($_.Exception.Message)" -ForegroundColor DarkYellow
        }
    }
}

# sf emite UTF-8 (box-drawing ─, ✔). Sin esto la consola lo pinta como "ÔöÇ".
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$OutputEncoding = [System.Text.Encoding]::UTF8

# Tipos que por si solos revientan el heap: cada uno en su propio retrieve.
$HeavyTypes = @(
    "CustomField",
    "CustomObject",
    "Layout",
    "Flow",
    "LightningComponentBundle",
    "PermissionSet",
    "ExperienceBundle"
)

if (-not (Test-Path $Manifest)) {
    throw "No existe el manifiesto: $Manifest. Genera con: sf project generate manifest --from-org $Org --name package --output-dir manifest"
}

# --- Parse package.xml y agrupa los <types> ---
[xml]$pkg = Get-Content $Manifest -Raw
$ns       = $pkg.Package.xmlns
$version  = $pkg.Package.version

$allTypes = @($pkg.Package.types)
if ($allTypes.Count -eq 0) { throw "El manifiesto no tiene bloques <types>." }

$heavy = $allTypes | Where-Object { $HeavyTypes -contains $_.name }
$light = $allTypes | Where-Object { $HeavyTypes -notcontains $_.name }

# Lotes:
#  - Pesados: members partidos en sub-lotes de HeavyMemberChunk (evita el race de
#    file handles en Windows: "UNKNOWN: unknown error, open ...object-meta.xml").
#  - Ligeros: en grupos de ChunkSize tipos.
$batches = [System.Collections.Generic.List[object]]::new()
foreach ($t in $heavy) {
    $members = @($t.members)
    for ($i = 0; $i -lt $members.Count; $i += $HeavyMemberChunk) {
        $end = [Math]::Min($i + $HeavyMemberChunk - 1, $members.Count - 1)
        $batches.Add(@( @{ name = $t.name; members = @($members[$i..$end]) } ))
    }
}
for ($i = 0; $i -lt $light.Count; $i += $ChunkSize) {
    $end = [Math]::Min($i + $ChunkSize - 1, $light.Count - 1)
    $batches.Add(@($light[$i..$end]))
}

$outDir = "manifest/split"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
Get-ChildItem $outDir -Filter "chunk-*.xml" -ErrorAction SilentlyContinue | Remove-Item -Force

$log = "retrieve-log.txt"
"=== sync-prod-retrieve $(Get-Date -Format s) | org=$Org heap=${HeapMB}MB chunk=$ChunkSize ===" |
    Out-File $log -Encoding utf8

$env:NODE_OPTIONS = "--max-old-space-size=$HeapMB"
Write-Host "NODE_OPTIONS=$env:NODE_OPTIONS" -ForegroundColor Cyan
Write-Host "$($batches.Count) lotes (pesados partidos en sub-lotes de $HeavyMemberChunk members + ligeros en grupos de $ChunkSize tipos)`n" -ForegroundColor Cyan

$failed = [System.Collections.Generic.List[string]]::new()
$n = 0
foreach ($batch in $batches) {
    $n++
    $mcount = ($batch | ForEach-Object { @($_.members).Count } | Measure-Object -Sum).Sum
    $names  = (($batch | ForEach-Object { $_.name } | Select-Object -Unique) -join ",") + " ($mcount members)"
    $file   = Join-Path $outDir ("chunk-{0:D2}.xml" -f $n)

    # Construye sub-manifiesto preservando el scope exacto del package.xml.
    $sb = [System.Text.StringBuilder]::new()
    [void]$sb.AppendLine('<?xml version="1.0" encoding="UTF-8"?>')
    [void]$sb.AppendLine("<Package xmlns=`"$ns`">")
    foreach ($t in $batch) {
        [void]$sb.AppendLine("    <types>")
        foreach ($m in @($t.members)) { [void]$sb.AppendLine("        <members>$m</members>") }
        [void]$sb.AppendLine("        <name>$($t.name)</name>")
        [void]$sb.AppendLine("    </types>")
    }
    if ($version) { [void]$sb.AppendLine("    <version>$version</version>") }
    [void]$sb.AppendLine("</Package>")
    $sb.ToString() | Out-File $file -Encoding utf8

    Write-Host ("[{0}/{1}] {2}" -f $n, $batches.Count, $names) -ForegroundColor Yellow
    "[$n/$($batches.Count)] $names" | Out-File $log -Append -Encoding utf8

    # Reintenta ante lock transitorio de Windows (UNKNOWN: open ...) o timeout.
    # Out-String aplana la salida (incl. stderr) a texto: evita el bloque rojo
    # NativeCommandError que PS 5.1 pinta al mergear stderr de un exe nativo.
    $ok = $false
    for ($try = 1; $try -le ($Retries + 1); $try++) {
        if ($try -gt 1) {
            Write-Host ("  reintento {0}/{1} (lock/timeout)..." -f ($try - 1), $Retries) -ForegroundColor DarkYellow
            "  reintento $($try-1)/$Retries" | Out-File $log -Append -Encoding utf8
            Start-Sleep -Seconds 5
        }
        $result = (& sf project retrieve start --manifest $file -o $Org --wait 30 2>&1 | Out-String)
        $code   = $LASTEXITCODE
        $result | Out-File $log -Append -Encoding utf8
        Write-Host $result

        # "Nothing retrieved" = esos members no viven en el org. No es fallo: skip.
        if ($result -match 'Nothing retrieved') {
            Write-Host "  SKIP (nada que traer para este lote)" -ForegroundColor DarkGray
            "  SKIP nothing-retrieved" | Out-File $log -Append -Encoding utf8
            $ok = $true; break
        }
        if ($code -eq 0) { $ok = $true; break }
    }

    if (-not $ok) {
        Write-Host "  FALLO (exit $code) -> $file" -ForegroundColor Red
        "  FALLO exit=$code" | Out-File $log -Append -Encoding utf8
        $failed.Add($names)
    }
}

Write-Host "`n=== Resumen ===" -ForegroundColor Cyan
if ($failed.Count -eq 0) {
    Write-Host "Todos los lotes OK. Revisa drift con: git status" -ForegroundColor Green
} else {
    Write-Host "$($failed.Count) lote(s) fallaron. Re-corre solo esos sub-manifiestos en manifest/split/:" -ForegroundColor Red
    $failed | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Write-Host "Ej: sf project retrieve start --manifest manifest/split/chunk-NN.xml -o $Org" -ForegroundColor Red
}
Write-Host "Log completo: $log"

if ($indexerPaused) {
    try { Start-Service WSearch -ErrorAction Stop; Write-Host "WSearch reiniciado." -ForegroundColor Cyan }
    catch { Write-Host "OJO: no se pudo reiniciar WSearch. Hazlo manual: Start-Service WSearch" -ForegroundColor Red }
}