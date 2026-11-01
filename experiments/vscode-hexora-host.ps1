param([Parameter(Mandatory=$true)][string]$ParentHwnd)
# Experimental VS Code window hosted inside the Hexora Electron BrowserWindow.
# Control protocol on stdin: RECT x y width height, SHOW, HIDE, QUIT.
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class HexoraNative {
 public delegate bool EnumWindowsProc(IntPtr hwnd,IntPtr lp);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback,IntPtr lp);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll",SetLastError=true)] public static extern IntPtr SetParent(IntPtr child,IntPtr parent);
 [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h,int index);
 [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr h,int index,int value);
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int height,uint flags);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int cmd);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr SetFocus(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern IntPtr GetFocus();
 [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr GetActiveWindow();
 [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
 [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a,uint b,bool attach);
 public static void Focus(IntPtr h) { uint pid;uint thread=GetWindowThreadProcessId(h,out pid);uint own=GetCurrentThreadId();bool linked=thread!=own&&AttachThreadInput(own,thread,true);try{SetForegroundWindow(h);SetFocus(h);}finally{if(linked)AttachThreadInput(own,thread,false);} }
 public static void FocusHosted(IntPtr parent,IntPtr child) {uint pid;uint childThread=GetWindowThreadProcessId(child,out pid);uint parentThread=GetWindowThreadProcessId(parent,out pid);uint own=GetCurrentThreadId();bool linkChild=childThread!=own&&AttachThreadInput(own,childThread,true);bool linkParent=parentThread!=own&&parentThread!=childThread&&AttachThreadInput(own,parentThread,true);try{SetForegroundWindow(parent);SetFocus(child);}finally{if(linkParent)AttachThreadInput(own,parentThread,false);if(linkChild)AttachThreadInput(own,childThread,false);} }
 public static string Diagnostic(IntPtr h) {var foreground=GetForegroundWindow();uint pid;uint thread=GetWindowThreadProcessId(h,out pid);uint own=GetCurrentThreadId();bool linked=thread!=own&&AttachThreadInput(own,thread,true);try{return "child="+h.ToInt64()+" foreground="+foreground.ToInt64()+" focus="+GetFocus().ToInt64()+" parent="+GetParent(h).ToInt64()+" valid="+IsWindow(h)+" visible="+IsWindowVisible(h)+" active="+GetActiveWindow().ToInt64()+" childThread="+thread+" hostThread="+own;}finally{if(linked)AttachThreadInput(own,thread,false);}}
 public static long[] Windows() {var found=new List<long>();EnumWindows((h,lp)=>{if(!IsWindowVisible(h))return true;var title=new StringBuilder(512);GetWindowText(h,title,512);uint pid;GetWindowThreadProcessId(h,out pid);try{if(title.Length>0&&System.Diagnostics.Process.GetProcessById((int)pid).ProcessName.Equals("Code",StringComparison.OrdinalIgnoreCase))found.Add(h.ToInt64());}catch{}return true;},IntPtr.Zero);return found.ToArray();}
}
'@
$parent=[IntPtr]([long]::Parse($ParentHwnd))
$cmd=Get-Command code.cmd -ErrorAction Stop
$existing=@([HexoraNative]::Windows())
Start-Process -FilePath $cmd.Source -ArgumentList '--new-window' | Out-Null
$deadline=[DateTime]::UtcNow.AddSeconds(25)
$child=[IntPtr]::Zero
do {
 Start-Sleep -Milliseconds 250
 $candidate=[HexoraNative]::Windows() | Where-Object {$_ -notin $existing} | Select-Object -First 1
 if($candidate){$child=[IntPtr]([long]$candidate)}
} until ($child -ne [IntPtr]::Zero -or [DateTime]::UtcNow -gt $deadline)
if($child -eq [IntPtr]::Zero){throw 'No new VS Code window detected'}
$oldStyle=[HexoraNative]::GetWindowLong($child,-16)
$newStyle=($oldStyle -band (-bnot ([int]0x80000000 -bor 0x00C00000 -bor 0x00040000))) -bor 0x40000000
$attached=$false
$detached=$false
$lastRect=@(0,0,900,650)
try {
 [void][HexoraNative]::SetWindowLong($child,-16,$newStyle)
 [void][HexoraNative]::SetParent($child,$parent)
 $attached=$true
 [HexoraNative]::FocusHosted($parent,$child)
 Write-Output ('DIAG READY '+[HexoraNative]::Diagnostic($child))
 Write-Output 'READY'
 while($null -ne ($line=[Console]::ReadLine())){
  $parts=$line.Trim().Split(' ')
  switch($parts[0]){
   'RECT' {if($parts.Length -eq 5){$lastRect=@([int]$parts[1],[int]$parts[2],[Math]::Max(1,[int]$parts[3]),[Math]::Max(1,[int]$parts[4]));if(-not $detached){[void][HexoraNative]::SetWindowPos($child,[IntPtr]::Zero,$lastRect[0],$lastRect[1],$lastRect[2],$lastRect[3],0x0024)}}}
   'SHOW' {[void][HexoraNative]::ShowWindow($child,5);[HexoraNative]::FocusHosted($parent,$child)}
   'FOCUS' {[HexoraNative]::FocusHosted($parent,$child);Write-Output ('DIAG FOCUS '+[HexoraNative]::Diagnostic($child))}
   'CHECK' {if(-not $detached -and [HexoraNative]::GetParent($child) -eq $parent -and [HexoraNative]::GetForegroundWindow() -eq $child){[HexoraNative]::FocusHosted($parent,$child);Write-Output ('DIAG REPAIRED '+[HexoraNative]::Diagnostic($child))}}
   'DIAG' {Write-Output ('DIAG '+($parts[1..($parts.Length-1)] -join ' ')+' '+[HexoraNative]::Diagnostic($child))}
   'HIDE' {[void][HexoraNative]::ShowWindow($child,0)}
   'DETACH' {if(-not $detached){[void][HexoraNative]::SetParent($child,[IntPtr]::Zero);[void][HexoraNative]::SetWindowLong($child,-16,$oldStyle);[void][HexoraNative]::SetWindowPos($child,[IntPtr]::Zero,120,120,1000,700,0x0024 -bor 0x0020);[void][HexoraNative]::ShowWindow($child,5);[HexoraNative]::Focus($child);$detached=$true;Write-Output ('DIAG DETACHED '+[HexoraNative]::Diagnostic($child));Write-Output 'DETACHED'}}
   'ATTACH' {if($detached){[void][HexoraNative]::SetWindowLong($child,-16,$newStyle);[void][HexoraNative]::SetParent($child,$parent);[void][HexoraNative]::SetWindowPos($child,[IntPtr]::Zero,$lastRect[0],$lastRect[1],$lastRect[2],$lastRect[3],0x0024 -bor 0x0020);[void][HexoraNative]::ShowWindow($child,5);[HexoraNative]::Focus($child);$detached=$false;Write-Output ('DIAG ATTACHED '+[HexoraNative]::Diagnostic($child));Write-Output 'ATTACHED'}}
   'QUIT' {break}
  }
  if($parts[0] -eq 'QUIT'){break}
 }
}finally{
 if($attached -and -not $detached){
  [void][HexoraNative]::SetParent($child,[IntPtr]::Zero)
  [void][HexoraNative]::SetWindowLong($child,-16,$oldStyle)
  [void][HexoraNative]::SetWindowPos($child,[IntPtr]::Zero,120,120,1000,700,0x0024)
  [void][HexoraNative]::ShowWindow($child,5)
 }
}
