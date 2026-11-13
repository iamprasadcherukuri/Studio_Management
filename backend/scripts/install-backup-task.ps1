param([string]$Time = '03:00', [switch]$Install)
$ErrorActionPreference = 'Stop'
$taskTime = [datetime]::ParseExact($Time, 'HH:mm', $null)
$backendDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$backupScript = Join-Path $PSScriptRoot 'verified-backup.js'
$nodePath = (Get-Command node -ErrorAction Stop).Source
if (!(Test-Path -LiteralPath (Join-Path $backendDirectory '.env'))) { throw 'Create the ignored backend/.env before scheduling local backups.' }
Write-Output "Task: StudioManagementLocalBackup; daily at $Time; working directory: $backendDirectory"
Write-Output 'Runs as the current signed-in user. No passwords are stored in the task definition.'
if (!$Install) { Write-Output 'Preview only. Add -Install to register this task.'; exit 0 }
$action = New-ScheduledTaskAction -Execute $nodePath -Argument ('"' + $backupScript + '"') -WorkingDirectory $backendDirectory
$trigger = New-ScheduledTaskTrigger -Daily -At $taskTime
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'StudioManagementLocalBackup' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Verified local PostgreSQL studio backup; requires this user to be signed in.' -Force | Out-Null
Write-Output 'Daily backup task registered.'
