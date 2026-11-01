# Native VS Code embedding feasibility spike (Windows only)
# Run: powershell -STA -ExecutionPolicy Bypass -File .\experiments\vscode-native-host.ps1
# This standalone test does NOT modify Hexora's main application.
# Close the host window to detach VS Code before disposing the host.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class NativeHost {
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr SetParent(IntPtr child, IntPtr parent);
  [DllImport("user32.dll", SetLastError=true)] public static extern int GetWindowLong(IntPtr hwnd, int index);
  [DllImport("user32.dll", SetLastError=true)] public static extern int SetWindowLong(IntPtr hwnd, int index, int value);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
}
'@
$GWL_STYLE = -16
$WS_CHILD = 0x40000000
$WS_POPUP = [int]0x80000000
$WS_CAPTION = 0x00C00000
$WS_THICKFRAME = 0x00040000
$SWP_NOZORDER = 0x0004
$SWP_FRAMECHANGED = 0x0020
$codeCommand = Get-Command code.cmd -ErrorAction SilentlyContinue
if (-not $codeCommand) { throw "VS Code CLI (code.cmd) not found in PATH. Install VS Code and enable its command-line launcher." }
$hostForm = New-Object System.Windows.Forms.Form
$hostForm.Text = 'Hexora native VS Code feasibility test'
$hostForm.Width = 1100
$hostForm.Height = 750
$panel = New-Object System.Windows.Forms.Panel
$panel.Dock = 'Fill'
$hostForm.Controls.Add($panel)
$script:child = [IntPtr]::Zero
$script:oldStyle = 0
$script:detached = $false
$resize = {
  if ($script:child -ne [IntPtr]::Zero) {
    [void][NativeHost]::SetWindowPos($script:child, [IntPtr]::Zero, 0, 0, $panel.ClientSize.Width, $panel.ClientSize.Height, $SWP_NOZORDER)
  }
}
$panel.Add_Resize($resize)
$hostForm.Add_Shown({
  $existing = @(Get-Process Code -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -ExpandProperty Id)
  Start-Process -FilePath $codeCommand.Source -ArgumentList '--new-window' | Out-Null
  $deadline = [DateTime]::UtcNow.AddSeconds(20)
  do {
    Start-Sleep -Milliseconds 250
    [System.Windows.Forms.Application]::DoEvents()
    $candidate = Get-Process Code -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero -and $_.Id -notin $existing } | Select-Object -First 1
  } until ($candidate -or [DateTime]::UtcNow -gt $deadline)
  if (-not $candidate) {
    [System.Windows.Forms.MessageBox]::Show('No new VS Code window was detected. VS Code may have reused an existing process/window.','Experiment')
    return
  }
  $script:child = $candidate.MainWindowHandle
  $script:oldStyle = [NativeHost]::GetWindowLong($script:child, $GWL_STYLE)
  $newStyle = ($script:oldStyle -band (-bnot ($WS_POPUP -bor $WS_CAPTION -bor $WS_THICKFRAME))) -bor $WS_CHILD
  [void][NativeHost]::SetWindowLong($script:child, $GWL_STYLE, $newStyle)
  $previous = [NativeHost]::SetParent($script:child, $panel.Handle)
  if ($previous -eq [IntPtr]::Zero -and [Runtime.InteropServices.Marshal]::GetLastWin32Error() -ne 0) {
    [void][NativeHost]::SetWindowLong($script:child, $GWL_STYLE, $script:oldStyle)
    $script:child = [IntPtr]::Zero
    [System.Windows.Forms.MessageBox]::Show('SetParent failed.','Experiment')
    return
  }
  [void][NativeHost]::SetWindowPos($script:child, [IntPtr]::Zero, 0, 0, $panel.ClientSize.Width, $panel.ClientSize.Height, $SWP_NOZORDER -bor $SWP_FRAMECHANGED)
})
$hostForm.Add_FormClosing({
  if ($script:child -ne [IntPtr]::Zero -and -not $script:detached) {
    $script:detached = $true
    [void][NativeHost]::SetParent($script:child, [IntPtr]::Zero)
    [void][NativeHost]::SetWindowLong($script:child, $GWL_STYLE, $script:oldStyle)
    [void][NativeHost]::SetWindowPos($script:child, [IntPtr]::Zero, 100, 100, 1000, 700, $SWP_NOZORDER -bor $SWP_FRAMECHANGED)
  }
})
[System.Windows.Forms.Application]::Run($hostForm)
