# Haki Shield - guarded weekly EasyList refresh.
# Called by Task Scheduler (weekly + at logon). Safe to run any time.
# Skips if a real check happened within the last 7 days, so a missed Sunday
# is caught up on the next logon without double-bumping the version.

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$stateFile = Join-Path $here 'easylist-state.json'
$updater = Join-Path $here 'update-easylist.mjs'
$logDir = Join-Path (Split-Path -Parent (Split-Path -Parent $here)) 'AI Lab\logs'
$log = Join-Path $logDir 'easylist-update.log'

function Write-Log([string]$line) {
    if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
    Add-Content -LiteralPath $log -Value ("{0} {1}" -f (Get-Date).ToUniversalTime().ToString('o'), $line) -Encoding UTF8
}

try {
    $due = $true
    if (Test-Path $stateFile) {
        $state = Get-Content -Raw -Encoding UTF8 $stateFile | ConvertFrom-Json
        if ($state.lastCheck) {
            $last = [datetime]::Parse($state.lastCheck).ToUniversalTime()
            if (((Get-Date).ToUniversalTime() - $last).TotalDays -lt 7) { $due = $false }
        }
    }
    if (-not $due) {
        Write-Log "SCHED_SKIP last check < 7 days ago"
        exit 0
    }

    Write-Log "SCHED_RUN start"
    $out = & node $updater 2>&1
    $out | ForEach-Object { Write-Log ("SCHED " + $_) }
    if ($LASTEXITCODE -ne 0) { throw "updater exited $LASTEXITCODE" }
    Write-Log "SCHED_DONE ok"
} catch {
    Write-Log ("SCHED_ERROR " + $_.Exception.Message)
    exit 1
}
