# Native VS Code embedding feasibility spike (Windows only)
# Run: powershell -STA -ExecutionPolicy Bypass -File .\experiments\vscode-native-host.ps1
# This standalone test does NOT modify Hexora's main application.
# Close the host window to detach VS Code before disposing the host.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class NativeHost {
  public delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lparam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lparam);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int maxCount);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
  public static IntPtr[] CodeWindows() {
    var windows = new List<IntPtr>();
    EnumWindows((hwnd, lparam) => {
      if (!IsWindowVisible(hwnd)) return true;
      var title = new StringBuilder(512);
      GetWindowText(hwnd, title, title.Capacity);
      uint pid; GetWindowThreadProcessId(hwnd, out pid);
      try { var p = System.Diagnostics.Process.GetProcessById((int)pid);
        if (string.Equals(p.ProcessName, "Code", StringComparison.OrdinalIgnoreCase) && title.Length > 0) windows.Add(hwnd);
      } catch {}
      return true;
    }, IntPtr.Zero);
    return windows.ToArray();
  }
  [DllImport("user32.dll")] public static extern IntPtr SetFocus(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool attach);
  public static bool FocusEmbedded(IntPtr hwnd) {
    if (hwnd == IntPtr.Zero) return false;
    uint childPid;
    uint childThread = GetWindowThreadProcessId(hwnd, out childPid);
    uint hostThread = GetCurrentThreadId();
    bool attached = childThread != hostThread && AttachThreadInput(hostThread, childThread, true);
    try {
      SetForegroundWindow(hwnd);
      SetFocus(hwnd);
      return true;
    } finally { if (attached) AttachThreadInput(hostThread, childThread, false); }
  }
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
# Attempt to forward keyboard focus to the embedded cross-process window.
# This is experimental: Windows/Electron may still reject focus or IME input.
$panel.Add_MouseDown({ if ($script:child -ne [IntPtr]::Zero) { [void][NativeHost]::FocusEmbedded($script:child) } })
$hostForm.Add_Activated({ if ($script:child -ne [IntPtr]::Zero) { [void][NativeHost]::FocusEmbedded($script:child) } })
$hostForm.Add_KeyDown({ if ($script:child -ne [IntPtr]::Zero) { [void][NativeHost]::FocusEmbedded($script:child) } })
$hostForm.Add_Shown({
  $existing = @([NativeHost]::CodeWindows() | ForEach-Object { $_.ToInt64() })
  Start-Process -FilePath $codeCommand.Source -ArgumentList '--new-window' | Out-Null
  $deadline = [DateTime]::UtcNow.AddSeconds(20)
  do {
    Start-Sleep -Milliseconds 250
    [System.Windows.Forms.Application]::DoEvents()
    $candidate = [NativeHost]::CodeWindows() | Where-Object { $_.ToInt64() -notin $existing } | Select-Object -First 1
  } until ($candidate -or [DateTime]::UtcNow -gt $deadline)
  if (-not $candidate) {
    [System.Windows.Forms.MessageBox]::Show('No new VS Code window was detected. Try closing extra VS Code windows and retry.','Experiment')
    return
  }
  $script:child = [IntPtr]$candidate
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
  [void][NativeHost]::FocusEmbedded($script:child)
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
