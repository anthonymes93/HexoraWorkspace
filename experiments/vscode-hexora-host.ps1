param(
 [Parameter(Mandatory=$true)][string]$ParentHwnd,
 [string]$ProjectPath='',
 [string]$CompanionVsix=''
)
# Experimental VS Code window hosted inside the Hexora Electron BrowserWindow.
# Control protocol on stdin: RECT x y width height, SHOW, HIDE, QUIT.
$ErrorActionPreference='Stop'
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
 [DllImport("user32.dll")] public static extern bool IsChild(IntPtr parent,IntPtr candidate);
 [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr h);
 [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT point);
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT point);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT rect);
 [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h,out RECT rect);
 [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
 [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h,StringBuilder name,int max);

 [DllImport("user32.dll")] public static extern IntPtr GetActiveWindow();
 [DllImport("user32.dll")] public static extern IntPtr SetActiveWindow(IntPtr h);
 [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
 [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a,uint b,bool attach);
 public static void Focus(IntPtr h) { uint pid;uint thread=GetWindowThreadProcessId(h,out pid);uint own=GetCurrentThreadId();bool linked=thread!=own&&AttachThreadInput(own,thread,true);try{SetForegroundWindow(h);SetFocus(h);}finally{if(linked)AttachThreadInput(own,thread,false);} }
 public static void FocusHosted(IntPtr parent,IntPtr child) {uint pid;uint childThread=GetWindowThreadProcessId(child,out pid);uint parentThread=GetWindowThreadProcessId(parent,out pid);uint own=GetCurrentThreadId();bool linkChild=childThread!=own&&AttachThreadInput(own,childThread,true);bool linkParent=parentThread!=own&&parentThread!=childThread&&AttachThreadInput(own,parentThread,true);try{SetForegroundWindow(parent);SetFocus(child);}finally{if(linkParent)AttachThreadInput(own,parentThread,false);if(linkChild)AttachThreadInput(own,childThread,false);} }
 public static void RestoreHostedFocus(IntPtr parent,IntPtr child) {uint pid;uint childThread=GetWindowThreadProcessId(child,out pid);uint parentThread=GetWindowThreadProcessId(parent,out pid);uint own=GetCurrentThreadId();var info=new GUITHREADINFO();info.cbSize=(uint)Marshal.SizeOf(typeof(GUITHREADINFO));bool hasInfo=GetGUIThreadInfo(childThread,ref info);IntPtr target=hasInfo&&info.hwndFocus!=IntPtr.Zero&&IsWindow(info.hwndFocus)&&(info.hwndFocus==child||IsChild(child,info.hwndFocus))?info.hwndFocus:child;bool linkChild=childThread!=own&&AttachThreadInput(own,childThread,true);bool linkParent=parentThread!=own&&parentThread!=childThread&&AttachThreadInput(own,parentThread,true);try{if(GetForegroundWindow()==parent){SetWindowPos(child,IntPtr.Zero,0,0,0,0,0x0013);SetFocus(target);}}finally{if(linkParent)AttachThreadInput(own,parentThread,false);if(linkChild)AttachThreadInput(own,childThread,false);}} 
 public static void ActivateHosted(IntPtr parent,IntPtr child) {uint pid;uint childThread=GetWindowThreadProcessId(child,out pid);uint parentThread=GetWindowThreadProcessId(parent,out pid);uint own=GetCurrentThreadId();bool linkChild=childThread!=own&&AttachThreadInput(own,childThread,true);bool linkParent=parentThread!=own&&parentThread!=childThread&&AttachThreadInput(own,parentThread,true);try{SetForegroundWindow(parent);SetActiveWindow(parent);SetFocus(child);}finally{if(linkParent)AttachThreadInput(own,parentThread,false);if(linkChild)AttachThreadInput(own,childThread,false);} }
 public static string Diagnostic(IntPtr h) {var foreground=GetForegroundWindow();uint pid;uint thread=GetWindowThreadProcessId(h,out pid);uint own=GetCurrentThreadId();bool linked=thread!=own&&AttachThreadInput(own,thread,true);try{return "child="+h.ToInt64()+" foreground="+foreground.ToInt64()+" focus="+GetFocus().ToInt64()+" parent="+GetParent(h).ToInt64()+" valid="+IsWindow(h)+" visible="+IsWindowVisible(h)+" active="+GetActiveWindow().ToInt64()+" childThread="+thread+" hostThread="+own;}finally{if(linked)AttachThreadInput(own,thread,false);}}
 [StructLayout(LayoutKind.Sequential)] public struct RECT {public int left;public int top;public int right;public int bottom;}
 [StructLayout(LayoutKind.Sequential)] public struct POINT {public int x;public int y;}
 [StructLayout(LayoutKind.Sequential)] public struct GUITHREADINFO {public uint cbSize;public uint flags;public IntPtr hwndActive;public IntPtr hwndFocus;public IntPtr hwndCapture;public IntPtr hwndMenuOwner;public IntPtr hwndMoveSize;public IntPtr hwndCaret;public RECT rcCaret;}
 [DllImport("user32.dll",SetLastError=true)] public static extern bool GetGUIThreadInfo(uint idThread,ref GUITHREADINFO info);
 public static string ThreadInfo(uint thread) {var i=new GUITHREADINFO();i.cbSize=(uint)Marshal.SizeOf(typeof(GUITHREADINFO));bool ok=GetGUIThreadInfo(thread,ref i);return "thread="+thread+" ok="+ok+" active="+i.hwndActive.ToInt64()+" focus="+i.hwndFocus.ToInt64()+" capture="+i.hwndCapture.ToInt64()+" flags="+i.flags;}
 public static string FocusTrace(IntPtr parent,IntPtr child) {uint pid;uint ct=GetWindowThreadProcessId(child,out pid);uint pt=GetWindowThreadProcessId(parent,out pid);uint fg=GetWindowThreadProcessId(GetForegroundWindow(),out pid);return "childEnabled="+IsWindowEnabled(child)+" parentEnabled="+IsWindowEnabled(parent)+" foreground="+GetForegroundWindow().ToInt64()+" foregroundThread="+fg+" child="+child.ToInt64()+" parent="+parent.ToInt64()+" childGUI=["+ThreadInfo(ct)+"] parentGUI=["+ThreadInfo(pt)+"] foregroundGUI=["+ThreadInfo(fg)+"]";}
 // Re-activation can put Electron's render-widget HWND above the reparented Code HWND.
 // Check actual Windows hit-testing during the activation transition instead of guessing.
 public static string Geometry(IntPtr parent,IntPtr child){
  RECT pr,cr;bool parentValid=GetClientRect(parent,out pr);bool childValid=GetWindowRect(child,out cr);
  return "parentClient="+(parentValid?(pr.right-pr.left)+"x"+(pr.bottom-pr.top):"invalid")+" childScreenRect="+(childValid?cr.left+","+cr.top+","+cr.right+","+cr.bottom:"invalid")+" visible="+IsWindowVisible(child)+" parent="+GetParent(child).ToInt64();
 }
 public static int zOrderRecoverySequence=0;
 public static void RecoverZOrder(IntPtr parent,IntPtr child) {
  int sequence=System.Threading.Interlocked.Increment(ref zOrderRecoverySequence);
  System.Threading.ThreadPool.QueueUserWorkItem(_=>{
   try{
    int[] offsets={0,40,100,200,350,550,850,1300,2000};
    int last=0;
    foreach(int offset in offsets) {
     System.Threading.Thread.Sleep(offset-last);last=offset;
     if(sequence!=zOrderRecoverySequence||!IsWindow(child)||GetParent(child)!=parent)break;
     if(!IsWindowVisible(child)||GetForegroundWindow()!=parent)continue;
     RECT rect; if(!GetWindowRect(child,out rect)||rect.right<=rect.left||rect.bottom<=rect.top)continue;
     POINT p=new POINT();p.x=rect.left+(rect.right-rect.left)/2;p.y=rect.top+(rect.bottom-rect.top)/2;
     IntPtr hit=WindowFromPoint(p);
     if(hit!=child&&!IsChild(child,hit)) {
      bool raised=SetWindowPos(child,IntPtr.Zero,0,0,0,0,0x0013);
      IntPtr after=WindowFromPoint(p);
      Console.WriteLine("Z_ORDER_RECOVERY offsetMs="+offset+" blockedBy="+hit.ToInt64()+" raised="+raised+" hitAfter="+after.ToInt64()+" restored="+(after==child||IsChild(child,after))+" child="+child.ToInt64());
     }
    }
   }catch(Exception error){Console.WriteLine("Z_ORDER_RECOVERY_ERROR "+error.Message);}
  });
 }
 public static int mouseProbeSequence=0;
 public static void WatchMouse(IntPtr parent,IntPtr child) {
  int sequence=System.Threading.Interlocked.Increment(ref mouseProbeSequence);
  System.Threading.ThreadPool.QueueUserWorkItem(_=>{
   try{
    bool wasDown=false;int reported=0;
    for(int i=0;i<400&&sequence==mouseProbeSequence;i++){
     bool down=(GetAsyncKeyState(1)&0x8000)!=0;
     if(down&&!wasDown&&reported<12){
      POINT point;RECT rect;
      if(GetCursorPos(out point)&&GetWindowRect(child,out rect)&&point.x>=rect.left&&point.x<rect.right&&point.y>=rect.top&&point.y<rect.bottom){
       IntPtr hit=WindowFromPoint(point);StringBuilder name=new StringBuilder(128);GetClassName(hit,name,128);
       uint pid;uint hitThread=GetWindowThreadProcessId(hit,out pid);
       Console.WriteLine("MOUSE_PROBE x="+point.x+" y="+point.y+" hit="+hit.ToInt64()+" hitClass="+name+" hitPid="+pid+" hitThread="+hitThread+" hitIsCode="+(hit==child||IsChild(child,hit))+" childEnabled="+IsWindowEnabled(child)+" parentEnabled="+IsWindowEnabled(parent)+" foreground="+GetForegroundWindow().ToInt64()+" child="+child.ToInt64()+" parent="+parent.ToInt64());
       reported++;
      }
     }
     wasDown=down;System.Threading.Thread.Sleep(30);
    }
   }catch(Exception error){Console.WriteLine("MOUSE_PROBE_ERROR "+error.Message);}
  });
 }
 public static long[] Windows() {var found=new List<long>();EnumWindows((h,lp)=>{if(!IsWindowVisible(h))return true;var title=new StringBuilder(512);GetWindowText(h,title,512);uint pid;GetWindowThreadProcessId(h,out pid);try{if(title.Length>0&&System.Diagnostics.Process.GetProcessById((int)pid).ProcessName.Equals("Code",StringComparison.OrdinalIgnoreCase))found.Add(h.ToInt64());}catch{}return true;},IntPtr.Zero);return found.ToArray();}
}
'@
$parent=[IntPtr]([long]::Parse($ParentHwnd))
# Always use the official VS Code CLI wrapper.  Code.exe alone does not perform
# the same CLI setup (notably on versioned Windows installs).
# CreateNoWindow hides only the cmd.exe interpreter; the VS Code GUI remains normal.
$cmd=Get-Command code.cmd -ErrorAction Stop
# First use only: install our small, local VS Code companion. This runs
# without a visible command prompt and never modifies project source files.
if($CompanionVsix -and (Test-Path -LiteralPath $CompanionVsix -PathType Leaf)){
 try {
  $install=New-Object System.Diagnostics.ProcessStartInfo
  $install.FileName=$env:ComSpec
  $install.Arguments=('/d /v:off /s /c ""{0}" --install-extension "%HEXORA_VSCODE_BRIDGE%" --force"' -f $cmd.Source)
  $install.EnvironmentVariables['HEXORA_VSCODE_BRIDGE']=$CompanionVsix
  $install.UseShellExecute=$false
  $install.CreateNoWindow=$true
  $install.RedirectStandardOutput=$true
  $install.RedirectStandardError=$true
  $installer=[System.Diagnostics.Process]::Start($install)
  if($null -ne $installer){
   $installLog=$installer.StandardOutput.ReadToEnd()
   $installError=$installer.StandardError.ReadToEnd()
   $installer.WaitForExit()
   if($installer.ExitCode -eq 0){Write-Output 'COMPANION_INSTALLED'}
   else{Write-Output ('COMPANION_INSTALL_FAILED code='+$installer.ExitCode+' details='+($installError.Trim() -replace '\\r?\\n',' '))}
  }else{Write-Output 'COMPANION_INSTALL_FAILED could-not-start'}
 }catch {
  Write-Output ('COMPANION_INSTALL_FAILED '+$_.Exception.Message)
 }
}
$existing=@([HexoraNative]::Windows())
$launchBegan=[DateTime]::UtcNow
$launch=New-Object System.Diagnostics.ProcessStartInfo
$launch.FileName=$env:ComSpec
if($ProjectPath){
 if(-not (Test-Path -LiteralPath $ProjectPath)){throw 'Saved VS Code project workspace does not exist'}
 # Pass the chosen directory through a child-only environment variable rather
 # than concatenating an arbitrary folder name into a cmd.exe command line.
 # /v:off prevents delayed ! expansion, including paths with ! characters.
 $launch.Arguments=('/d /v:off /s /c ""{0}" --new-window "%HEXORA_VSCODE_PROJECT%""' -f $cmd.Source)
 $launch.EnvironmentVariables['HEXORA_VSCODE_PROJECT']=$ProjectPath
 Write-Output 'LAUNCH_SAVED_PROJECT'
}else{
 $launch.Arguments=('/d /s /c ""{0}" --new-window"' -f $cmd.Source)
}
$launch.UseShellExecute=$false
$launch.CreateNoWindow=$true
$launch.WorkingDirectory=Split-Path -Path $cmd.Source -Parent
Write-Output 'LAUNCH_CODE_CLI_HIDDEN'
$launcher=[System.Diagnostics.Process]::Start($launch)
if($null -eq $launcher){throw 'VS Code CLI launcher could not start'}
$deadline=[DateTime]::UtcNow.AddSeconds(25)
$child=[IntPtr]::Zero
do {
 Start-Sleep -Milliseconds 40
 $candidate=[HexoraNative]::Windows() | Where-Object {$_ -notin $existing} | Select-Object -First 1
 if($candidate){$child=[IntPtr]([long]$candidate)}
} until ($child -ne [IntPtr]::Zero -or [DateTime]::UtcNow -gt $deadline)
if($child -eq [IntPtr]::Zero){throw 'No new VS Code window detected'}
$captureElapsedMs=[int](([DateTime]::UtcNow-$launchBegan).TotalMilliseconds)
Write-Output ('WINDOW_CAPTURED hwnd='+$child.ToInt64()+' elapsedMs='+$captureElapsedMs)
$oldStyle=[HexoraNative]::GetWindowLong($child,-16)
$newStyle=($oldStyle -band (-bnot ([int]0x80000000 -bor 0x00C00000 -bor 0x00040000))) -bor 0x40000000
$attached=$false
$detached=$false
$lastRect=@(0,0,900,650)
try {
 [void][HexoraNative]::SetWindowLong($child,-16,$newStyle)
 [void][HexoraNative]::SetParent($child,$parent)
 if(-not [HexoraNative]::IsWindow($child) -or [HexoraNative]::GetParent($child) -ne $parent){
  throw ('Windows did not attach VS Code hwnd '+$child.ToInt64()+' to Hexora hwnd '+$parent.ToInt64())
 }
 $attached=$true
 # Hide the verified child until its owning tab sends SHOW. Never focus a background tab.
 [void][HexoraNative]::ShowWindow($child,0)
 Write-Output ('ATTACH_VERIFIED hwnd='+$child.ToInt64()+' parent='+$parent.ToInt64())
 Write-Output ('DIAG READY '+[HexoraNative]::Diagnostic($child))
 Write-Output ('FOCUS_TRACE READY '+[HexoraNative]::FocusTrace($parent,$child))
 Write-Output 'READY'
 while($null -ne ($line=[Console]::ReadLine())){
  $parts=$line.Trim().Split(' ')
  switch($parts[0]){
   'RECT' {if($parts.Length -eq 5){$lastRect=@([int]$parts[1],[int]$parts[2],[Math]::Max(1,[int]$parts[3]),[Math]::Max(1,[int]$parts[4]));if(-not $detached){[void][HexoraNative]::SetWindowPos($child,[IntPtr]::Zero,$lastRect[0],$lastRect[1],$lastRect[2],$lastRect[3],0x0024)}}}
   'SHOW' {[void][HexoraNative]::ShowWindow($child,5);[HexoraNative]::FocusHosted($parent,$child)}
   'FOCUS' {[HexoraNative]::FocusHosted($parent,$child);Write-Output ('DIAG FOCUS '+[HexoraNative]::Diagnostic($child))}
   'RESTORE' {if(-not $detached -and [HexoraNative]::GetParent($child) -eq $parent){Write-Output ('FOCUS_TRACE RESTORE_BEFORE '+[HexoraNative]::FocusTrace($parent,$child));[HexoraNative]::RestoreHostedFocus($parent,$child);Write-Output ('FOCUS_TRACE RESTORE_AFTER '+[HexoraNative]::FocusTrace($parent,$child))}}
   'ACTIVATE' {if(-not $detached -and [HexoraNative]::IsWindow($child) -and [HexoraNative]::GetParent($child) -eq $parent -and [HexoraNative]::GetForegroundWindow() -eq $parent){[HexoraNative]::ActivateHosted($parent,$child);Write-Output ('DIAG ACTIVATED '+[HexoraNative]::Diagnostic($child))}}
   'CHECK' {if(-not $detached -and [HexoraNative]::IsWindow($child) -and [HexoraNative]::GetParent($child) -eq $parent -and [HexoraNative]::GetForegroundWindow() -eq $parent){$state=[HexoraNative]::Diagnostic($child);if($state -match ('focus='+$parent.ToInt64()+'(\s|$)')){[HexoraNative]::FocusHosted($parent,$child);Write-Output ('DIAG REPAIRED '+[HexoraNative]::Diagnostic($child))}}}
   'TRACE' {Write-Output ('FOCUS_TRACE '+($parts[1..($parts.Length-1)] -join ' ')+' '+[HexoraNative]::FocusTrace($parent,$child))}
   'WATCH_MOUSE' {if(-not $detached){[HexoraNative]::WatchMouse($parent,$child);Write-Output 'MOUSE_PROBE ARMED'}}
   'RECOVER_Z' {if(-not $detached -and [HexoraNative]::GetParent($child) -eq $parent){[HexoraNative]::RecoverZOrder($parent,$child);Write-Output 'Z_ORDER_RECOVERY ARMED'}}
   'GEOMETRY' {if(-not $detached){Write-Output ('GEOMETRY '+($parts[1..($parts.Length-1)] -join ' ')+' '+[HexoraNative]::Geometry($parent,$child)+' requestedRect='+($lastRect -join ','))}}
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
