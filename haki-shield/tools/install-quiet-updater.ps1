#Requires -Version 5.1
# Registers a silent task that checks our unpacked extension version at logon
# and daily. It only touches Brave when the disk version actually changed.
$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'auto-update-extensions.ps1'
$name = 'Haki Shield - Quiet Updater'
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

$old = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
if ($old) { Unregister-ScheduledTask -TaskName $name -Confirm:$false }

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $script + '"')
$atLogon = New-ScheduledTaskTrigger -AtLogOn -User $user
$daily = New-ScheduledTaskTrigger -Daily -At '04:05'
$settings = New-ScheduledTaskSettingsSet -Hidden -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $name -Action $action -Trigger @($atLogon, $daily) -Principal $principal -Settings $settings -Description 'Quietly re-reads Haki Shield in main Brave and debug Brave 9222 when the version on disk changes.' | Out-Null

$t = Get-ScheduledTask -TaskName $name
$i = Get-ScheduledTaskInfo -TaskName $name
"TASK=$($t.TaskName) STATE=$($t.State) NEXT=$($i.NextRunTime) LAST=$($i.LastRunTime) RESULT=$($i.LastTaskResult)"
