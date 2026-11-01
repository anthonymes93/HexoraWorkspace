# Read-only diagnostics for VS Code processes when Codex webviews fail.
# Never stops processes or changes VS Code profile data.
$ErrorActionPreference = 'Stop'
$hexoraProfile = Join-Path $env:APPDATA 'Hexora\VSCodeProfile'
$regularProfile = Join-Path $env:APPDATA 'Code'
Write-Output ('HEXORA_PROFILE=' + $hexoraProfile)
Write-Output ('REGULAR_PROFILE=' + $regularProfile)
Write-Output ('TIME=' + (Get-Date).ToString('o'))
$rows = @(Get-CimInstance Win32_Process -Filter "Name = 'Code.exe'" -ErrorAction Stop)
Write-Output ('CODE_PROCESS_COUNT=' + $rows.Count)
foreach ($p in $rows | Sort-Object ProcessId) {
  $cmd = [string]$p.CommandLine
  $profile = if ($cmd.IndexOf($hexoraProfile, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
    'hexora-explicit'
  } elseif ($cmd.IndexOf($regularProfile, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
    'regular-explicit'
  } elseif ($cmd -match '(?i)--user-data-dir') {
    'other-explicit'
  } else {
    'unspecified'
  }
  $kind = if ($cmd -match '(?i)--type=([a-z-]+)') { $Matches[1] } else { 'main-or-unspecified' }
  # Do not print command lines: they can contain private paths and arguments.
  Write-Output ('CODE_PROCESS pid=' + $p.ProcessId + ' parentPid=' + $p.ParentProcessId + ' type=' + $kind + ' profile=' + $profile + ' started=' + $p.CreationDate)
}
Write-Output 'NOTE: An unspecified profile is not proof that a process uses the regular profile; Chromium child processes may omit the argument.'
