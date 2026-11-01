param([Parameter(Mandatory=$true)][string]$CompanionVsix)
$ErrorActionPreference='Stop'
try {
 if(-not (Test-Path -LiteralPath $CompanionVsix -PathType Leaf)){throw 'Companion VSIX missing'}
 $code=(Get-Command code.cmd -ErrorAction Stop).Source
 $p=New-Object System.Diagnostics.ProcessStartInfo
 $p.FileName=$env:ComSpec
 $p.Arguments=('/d /v:off /s /c ""{0}" --install-extension "%HEXORA_VSCODE_BRIDGE%" --force"' -f $code)
 $p.EnvironmentVariables['HEXORA_VSCODE_BRIDGE']=$CompanionVsix
 $p.UseShellExecute=$false
 $p.CreateNoWindow=$true
 $p.RedirectStandardOutput=$true
 $p.RedirectStandardError=$true
 $process=[System.Diagnostics.Process]::Start($p)
 if($null -eq $process){throw 'Could not launch Code extension installer'}
 $stdout=$process.StandardOutput.ReadToEnd()
 $stderr=$process.StandardError.ReadToEnd()
 $process.WaitForExit()
 if($process.ExitCode -ne 0){throw ('VS Code exited with '+$process.ExitCode+': '+$stderr.Trim())}
 Write-Output 'COMPANION_INSTALLED'
}catch{
 Write-Error ('COMPANION_INSTALL_FAILED '+$_.Exception.Message)
 exit 1
}
