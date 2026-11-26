#Requires -Version 5.1
<#
  Haki Shield — quiet updater for our own unpacked extensions.
  Only does anything when the version on disk differs from the last applied
  version. Main Brave is refreshed through Update -> Reload; debug Brave 9222
  is refreshed through CDP when it is running.
  No credentials, no network, no data leaves the PC.
#>
param(
  [switch]$CheckOnly,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$manifest = Join-Path $root 'manifest.json'
$marker = Join-Path $PSScriptRoot 'auto-update-state.json'
$shieldId = 'hlabfjphnejfjhlilhpfkoanlejpomin'
$version = (Get-Content -Raw -Encoding UTF8 $manifest | ConvertFrom-Json).version

$state = $null
if (Test-Path $marker) {
  try { $state = Get-Content -Raw -Encoding UTF8 $marker | ConvertFrom-Json } catch { $state = $null }
}
$applied = if ($state -and $state.version) { [string]$state.version } else { '' }
$need = $Force -or ($applied -ne $version)

if ($CheckOnly) {
  Write-Output ("disk=$version applied=$applied need=" + [bool]$need)
  exit 0
}
if (-not $need) { Write-Output ("NO_CHANGE version=$version"); exit 0 }

$results = @()

# --- main Brave: re-read the manifest and reload the card ---
$mainScript = Join-Path $root 'reload-shield-main.ps1'
$procs = @(Get-Process brave -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })
$debugPids = @(Get-CimInstance Win32_Process -Filter "Name='brave.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'remote-debugging-port=9222' } | ForEach-Object { $_.ProcessId })
$mainProcs = @($procs | Where-Object { $debugPids -notcontains $_.Id })
if ($mainProcs.Count -gt 0 -and (Test-Path $mainScript)) {
  try {
    $out = & powershell -NoProfile -ExecutionPolicy Bypass -File $mainScript 2>&1 | Out-String
    if ($out -match 'CLICKED NEAREST RELOAD|UPDATE CLICKED') { $results += 'main=reloaded' }
    else { $results += 'main=attempted (' + ($out -replace '\s+', ' ').Trim().Substring(0, [Math]::Min(120, $out.Length)) + ')' }
  } catch { $results += 'main=error' }
} else {
  $results += 'main=not-running'
}

# --- debug Brave 9222: load unpacked directly through CDP ---
$listening = Get-NetTCPConnection -LocalPort 9222 -State Listen -ErrorAction SilentlyContinue
if ($listening) {
  try {
    $v = Invoke-RestMethod -Uri 'http://127.0.0.1:9222/json/version' -TimeoutSec 5
    $wsUrl = $v.webSocketDebuggerUrl
    if (-not $wsUrl) { throw 'no webSocketDebuggerUrl' }
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ct = [System.Threading.CancellationToken]::None
    $ws.ConnectAsync([Uri]$wsUrl, $ct).GetAwaiter().GetResult() | Out-Null
    $payload = @{ id = 1; method = 'Extensions.loadUnpacked'; params = @{ path = ($root -replace '\\','/') } } | ConvertTo-Json -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
    $seg = New-Object System.ArraySegment[byte] -ArgumentList @(, $bytes)
    $ws.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).GetAwaiter().GetResult() | Out-Null
    $buf = New-Object byte[] 16384
    $seg2 = New-Object System.ArraySegment[byte] -ArgumentList @(, $buf)
    $null = $ws.ReceiveAsync($seg2, $ct).GetAwaiter().GetResult()
    $ws.Dispose()
    $results += 'debug9222=loaded'
  } catch { $results += 'debug9222=error' }
} else {
  $results += 'debug9222=not-running'
}

$enc = New-Object System.Text.UTF8Encoding($false)
$newState = @{ version = $version; appliedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'); id = $shieldId }
[IO.File]::WriteAllText($marker, ($newState | ConvertTo-Json -Compress), $enc)
Write-Output ("UPDATED version=$version " + ($results -join ', '))
