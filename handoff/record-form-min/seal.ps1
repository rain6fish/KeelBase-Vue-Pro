# Seal the session record: mark files read-only, compute sha256, write a manifest.
# 收场封存：把记录文件置只读、算 sha256、写清单。
#
# Usage / 用法 (Windows PowerShell 5.1+, nothing to install):
#   powershell -File .\seal.ps1 -Path .\reader-sheet-2026-12-01-alice.md, .\question-log-2026-12-01.md
#
# Note / 注意: the manifest never hashes itself; do not list it in -Path.
# 清单不参与自己的哈希，不要把清单本身写进 -Path。

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string[]]$Path,

    [string]$OutFile = "seal-manifest.txt"
)

$ErrorActionPreference = "Stop"

# `powershell -File` passes the whole "a,b" as one string; split it here.
# 用 -File 调用时 "a,b" 会作为一个字符串传入，这里拆开。
$Path = @($Path | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })

$missing = @()
foreach ($p in $Path) {
    if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { $missing += $p }
}
if ($missing.Count -gt 0) {
    Write-Host "Missing files, nothing changed:" -ForegroundColor Red
    $missing | ForEach-Object { Write-Host ("  " + $_) }
    exit 1
}

$base = (Get-Location).Path
$lines = New-Object System.Collections.Generic.List[string]

foreach ($p in $Path) {
    $item = Get-Item -LiteralPath $p
    $item.IsReadOnly = $true
    $hash = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLowerInvariant()

    $name = $item.FullName
    if ($name.StartsWith($base, [StringComparison]::OrdinalIgnoreCase)) {
        $name = $name.Substring($base.Length).TrimStart('\', '/')
    }
    $lines.Add(("{0}  {1}" -f $hash, $name))
}

$outFull = [System.IO.Path]::GetFullPath((Join-Path (Get-Location).Path $OutFile))
$utf8 = New-Object System.Text.UTF8Encoding($false)
# LF endings so `sha256sum -c` reads the names without a trailing CR.
# 用 LF 换行，免得 sha256sum -c 把 CR 当成文件名的一部分。
[System.IO.File]::WriteAllText($outFull, (($lines -join "`n") + "`n"), $utf8)

Write-Host ("Sealed {0} file(s) read-only; manifest: {1}" -f $lines.Count, $outFull) -ForegroundColor Green
$lines | ForEach-Object { Write-Host ("  " + $_) }
Write-Host "Verify: sha256sum -c <manifest>   or   Get-FileHash -Algorithm SHA256 <file>"
