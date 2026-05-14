'use strict';
/**
 * Windows Control Tool Plugin
 * ===========================
 * Full Windows desktop automation via PowerShell.
 * No extra npm packages — uses child_process + PowerShell natively.
 *
 * Capabilities:
 *   screenshot, mouse_move, mouse_click, type_text, key_press,
 *   get_clipboard, set_clipboard, list_processes, start_process, kill_process,
 *   list_windows, focus_window, system_info, send_notification,
 *   run_powershell, open_file, set_volume, minimize_window, maximize_window
 */

const { execSync } = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const PS_TIMEOUT = 30000;
const WINAPI_TYPE = `
Add-Type @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class WinCtrl {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, int e);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc e, IntPtr l);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int m);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] public static extern IntPtr FindWindow(string cls, string title);
    public delegate bool EnumWindowsProc(IntPtr h, IntPtr l);
    public const uint LEFTDOWN=0x2, LEFTUP=0x4, RIGHTDOWN=0x8, RIGHTUP=0x10, DBLCLK=0x6;
    public const int SW_MINIMIZE=6, SW_MAXIMIZE=3, SW_RESTORE=9;
    public static List<object[]> GetWindows() {
        var r = new List<object[]>();
        EnumWindows((h, l) => {
            if (!IsWindowVisible(h)) return true;
            var sb = new StringBuilder(256);
            GetWindowText(h, sb, 256);
            uint pid; GetWindowThreadProcessId(h, out pid);
            if (sb.Length > 0) r.Add(new object[]{ h.ToInt64(), sb.ToString(), (long)pid });
            return true;
        }, IntPtr.Zero);
        return r;
    }
}
"@`;

// Write a temp .ps1 file and execute it — avoids all quoting/escaping issues
function runPS(script) {
  const tmp = path.join(os.tmpdir(), `octo_win_${Date.now()}_${Math.random().toString(36).slice(2)}.ps1`);
  try {
    fs.writeFileSync(tmp, '﻿' + script, 'utf8');  // BOM for PowerShell UTF-8 safety
    const out = execSync(
      `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tmp}"`,
      { timeout: PS_TIMEOUT, encoding: 'utf8', windowsHide: true }
    );
    return (out || '').trim();
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

// ── Action handlers ───────────────────────────────────────────────────────────

function screenshot() {
  const script = `
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp    = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
$gfx    = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
$ms     = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$gfx.Dispose(); $bmp.Dispose()
[Convert]::ToBase64String($ms.ToArray())`;
  const b64 = runPS(script);
  return { ok: true, format: 'png', base64: b64, width: null, height: null };
}

function mouseMove(x, y) {
  const script = `
${WINAPI_TYPE}
[WinCtrl]::SetCursorPos(${Math.round(x)}, ${Math.round(y)})`;
  runPS(script);
  return { ok: true, x, y };
}

function mouseClick(x, y, button = 'left') {
  const downFlag = button === 'right'  ? 'RIGHTDOWN' :
                   button === 'double' ? 'LEFTDOWN'  : 'LEFTDOWN';
  const upFlag   = button === 'right'  ? 'RIGHTUP'   : 'LEFTUP';
  const doubleClick = button === 'double';

  const script = `
${WINAPI_TYPE}
[WinCtrl]::SetCursorPos(${Math.round(x)}, ${Math.round(y)})
Start-Sleep -Milliseconds 50
[WinCtrl]::mouse_event([WinCtrl]::${downFlag}, 0, 0, 0, 0)
[WinCtrl]::mouse_event([WinCtrl]::${upFlag}, 0, 0, 0, 0)
${doubleClick ? '[WinCtrl]::mouse_event([WinCtrl]::LEFTDOWN, 0, 0, 0, 0)\n[WinCtrl]::mouse_event([WinCtrl]::LEFTUP, 0, 0, 0, 0)' : ''}`;
  runPS(script);
  return { ok: true, x, y, button };
}

function typeText(text) {
  // Escape special characters for SendKeys
  const escaped = text
    .replace(/\{/g, '{{}')
    .replace(/\}/g, '{}}')
    .replace(/\+/g, '{+}')
    .replace(/%/g, '{%}')
    .replace(/\^/g, '{^}')
    .replace(/~/g, '{~}')
    .replace(/\(/g, '{(}')
    .replace(/\)/g, '{)}');
  const script = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("${escaped.replace(/"/g, '`"')}")`;
  runPS(script);
  return { ok: true, text };
}

function keyPress(keys) {
  // Map common key names to SendKeys syntax
  const keyMap = {
    'CTRL':  '^', 'ALT': '%', 'SHIFT': '+', 'WIN': '^{ESC}',
    'ENTER': '{ENTER}', 'TAB': '{TAB}', 'ESC': '{ESC}',
    'BACKSPACE': '{BACKSPACE}', 'DELETE': '{DELETE}',
    'UP': '{UP}', 'DOWN': '{DOWN}', 'LEFT': '{LEFT}', 'RIGHT': '{RIGHT}',
    'HOME': '{HOME}', 'END': '{END}', 'PGUP': '{PGUP}', 'PGDN': '{PGDN}',
    'F1': '{F1}', 'F2': '{F2}', 'F3': '{F3}', 'F4': '{F4}',
    'F5': '{F5}', 'F6': '{F6}', 'F7': '{F7}', 'F8': '{F8}',
    'F9': '{F9}', 'F10': '{F10}', 'F11': '{F11}', 'F12': '{F12}',
    'SPACE': ' ', 'CAPSLOCK': '{CAPSLOCK}', 'PRINTSCREEN': '{PRTSC}',
  };

  // Parse "CTRL+C" → "^c", "ALT+F4" → "%{F4}", etc.
  const parts = keys.toUpperCase().split('+');
  let sendKeys = '';
  const modifiers = { 'CTRL': '^', 'ALT': '%', 'SHIFT': '+' };
  const mods = parts.filter(p => modifiers[p]).map(p => modifiers[p]).join('');
  const mainKeys = parts.filter(p => !modifiers[p]);

  if (mainKeys.length === 0) {
    sendKeys = mods;
  } else {
    const mapped = mainKeys.map(k => keyMap[k] || k.toLowerCase()).join('');
    sendKeys = mods ? `${mods}${mapped}` : mapped;
  }

  const script = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("${sendKeys.replace(/"/g, '`"')}")`;
  runPS(script);
  return { ok: true, keys, sendKeys };
}

function getClipboard() {
  const script = `Get-Clipboard`;
  const text = runPS(script);
  return { ok: true, text };
}

function setClipboard(text) {
  const escaped = text.replace(/'/g, "''");
  const script = `Set-Clipboard -Value '${escaped}'`;
  runPS(script);
  return { ok: true, text };
}

function listProcesses() {
  const script = `
Get-Process | Sort-Object CPU -Descending | Select-Object -First 50 Name, Id,
  @{N='CPU';E={[Math]::Round($_.CPU,1)}},
  @{N='Memory_MB';E={[Math]::Round($_.WorkingSet/1MB,1)}},
  @{N='Path';E={try{$_.MainModule.FileName}catch{''}}}  |
  ConvertTo-Json -Depth 2`;
  const raw = runPS(script);
  return { ok: true, processes: JSON.parse(raw || '[]') };
}

function startProcess(proc, args = '') {
  const escaped = proc.replace(/'/g, "''");
  const argsPart = args ? ` -ArgumentList '${args.replace(/'/g, "''")}'` : '';
  const script = `Start-Process -FilePath '${escaped}'${argsPart} -PassThru | Select-Object Id,Name | ConvertTo-Json`;
  const raw = runPS(script);
  return { ok: true, result: JSON.parse(raw || '{}') };
}

function killProcess(procName, pid) {
  let script;
  if (pid) {
    script = `Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue; "killed pid ${pid}"`;
  } else if (procName) {
    const escaped = procName.replace(/'/g, "''");
    script = `Stop-Process -Name '${escaped}' -Force -ErrorAction SilentlyContinue; "killed ${procName}"`;
  } else {
    return { ok: false, error: 'process name or pid required' };
  }
  const out = runPS(script);
  return { ok: true, result: out };
}

function listWindows() {
  const script = `
${WINAPI_TYPE}
[WinCtrl]::GetWindows() | ForEach-Object {
  [PSCustomObject]@{ Handle = $_[0]; Title = $_[1]; PID = $_[2] }
} | ConvertTo-Json -Depth 2`;
  const raw = runPS(script);
  return { ok: true, windows: JSON.parse(raw || '[]') };
}

function focusWindow(title, handle) {
  let script;
  if (handle) {
    script = `
${WINAPI_TYPE}
$h = [IntPtr]::new(${handle})
[WinCtrl]::ShowWindow($h, [WinCtrl]::SW_RESTORE)
[WinCtrl]::SetForegroundWindow($h)`;
  } else if (title) {
    const escaped = title.replace(/'/g, "''");
    script = `
${WINAPI_TYPE}
$wins = [WinCtrl]::GetWindows()
$target = $wins | Where-Object { $_[1] -like '*${escaped.replace(/\*/g, '')}*' } | Select-Object -First 1
if ($target) {
  $h = [IntPtr]::new($target[0])
  [WinCtrl]::ShowWindow($h, [WinCtrl]::SW_RESTORE)
  [WinCtrl]::SetForegroundWindow($h)
  "Focused: $($target[1])"
} else { "Window not found: ${escaped}" }`;
  } else {
    return { ok: false, error: 'title or handle required' };
  }
  const out = runPS(script);
  return { ok: true, result: out };
}

function minimizeWindow(title, handle) {
  let script;
  if (handle) {
    script = `
${WINAPI_TYPE}
[WinCtrl]::ShowWindow([IntPtr]::new(${handle}), [WinCtrl]::SW_MINIMIZE)`;
  } else {
    const escaped = (title || '').replace(/'/g, "''");
    script = `
${WINAPI_TYPE}
$wins = [WinCtrl]::GetWindows()
$target = $wins | Where-Object { $_[1] -like '*${escaped}*' } | Select-Object -First 1
if ($target) { [WinCtrl]::ShowWindow([IntPtr]::new($target[0]), [WinCtrl]::SW_MINIMIZE); "Minimized: $($target[1])" }
else { "Not found: ${escaped}" }`;
  }
  const out = runPS(script);
  return { ok: true, result: out };
}

function maximizeWindow(title, handle) {
  let script;
  if (handle) {
    script = `
${WINAPI_TYPE}
[WinCtrl]::ShowWindow([IntPtr]::new(${handle}), [WinCtrl]::SW_MAXIMIZE)`;
  } else {
    const escaped = (title || '').replace(/'/g, "''");
    script = `
${WINAPI_TYPE}
$wins = [WinCtrl]::GetWindows()
$target = $wins | Where-Object { $_[1] -like '*${escaped}*' } | Select-Object -First 1
if ($target) { [WinCtrl]::ShowWindow([IntPtr]::new($target[0]), [WinCtrl]::SW_MAXIMIZE); "Maximized: $($target[1])" }
else { "Not found: ${escaped}" }`;
  }
  const out = runPS(script);
  return { ok: true, result: out };
}

function systemInfo() {
  const script = `
$cpu  = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
$mem  = Get-CimInstance Win32_OperatingSystem
$disk = Get-PSDrive C -ErrorAction SilentlyContinue
$os   = (Get-CimInstance Win32_OperatingSystem).Caption
$up   = (Get-Date) - (gcim Win32_OperatingSystem).LastBootUpTime
[PSCustomObject]@{
  computer    = $env:COMPUTERNAME
  os          = $os
  cpu_pct     = $cpu
  ram_total_gb= [Math]::Round($mem.TotalVisibleMemorySize/1MB, 2)
  ram_free_gb = [Math]::Round($mem.FreePhysicalMemory/1MB, 2)
  disk_free_gb= if($disk){[Math]::Round($disk.Free/1GB,2)}else{$null}
  disk_used_gb= if($disk){[Math]::Round($disk.Used/1GB,2)}else{$null}
  uptime_hrs  = [Math]::Round($up.TotalHours, 1)
  username    = $env:USERNAME
  time        = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
} | ConvertTo-Json`;
  const raw = runPS(script);
  return { ok: true, info: JSON.parse(raw || '{}') };
}

function sendNotification(message, heading = 'Octopus') {
  const safeMsg     = message.replace(/'/g, "''").replace(/"/g, '`"');
  const safeHeading = heading.replace(/'/g, "''").replace(/"/g, '`"');
  const script = `
Add-Type -AssemblyName System.Windows.Forms
$n = New-Object System.Windows.Forms.NotifyIcon
$n.Icon = [System.Drawing.SystemIcons]::Information
$n.BalloonTipTitle = "${safeHeading}"
$n.BalloonTipText  = "${safeMsg}"
$n.Visible = $true
$n.ShowBalloonTip(5000)
Start-Sleep -Milliseconds 500
$n.Dispose()`;
  runPS(script);
  return { ok: true, heading, message };
}

function setVolume(level) {
  const pct = Math.max(0, Math.min(100, Math.round(level)));
  const script = `
$vol = ${pct} / 100.0
Add-Type @"
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
    int _a();int _b();int _c();int _d();
    int SetMasterVolumeLevelScalar(float f, System.Guid g);
    int _f();int GetMasterVolumeLevelScalar(out float f);
    int _h();int _i();int _j();int _k();int _l();
}
[Guid("BCDE0395-E52F-467C-8E3D-C4579291692E"),CoClass(typeof(object))] interface MMDeviceEnumerator {}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
    int _a();
    int GetDefaultAudioEndpoint(int dF, int r, out IMMDevice ppD);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
    int Activate([MarshalAs(UnmanagedType.LPStruct)] System.Guid id, int ctx, System.IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
}
"@ -PassThru | Out-Null
$de = [Activator]::CreateInstance([Type]::GetTypeFromCLSID([Guid]"BCDE0395-E52F-467C-8E3D-C4579291692E"))
$devEnum = [IMMDeviceEnumerator]$de
$dev = $null; $devEnum.GetDefaultAudioEndpoint(0, 0, [ref]$dev) | Out-Null
$ep = $null; $dev.Activate([Guid]"5CDF2C82-841E-4546-9722-0CF74078229A", 23, [IntPtr]::Zero, [ref]$ep) | Out-Null
$vol_ctrl = [IAudioEndpointVolume]$ep
$vol_ctrl.SetMasterVolumeLevelScalar($vol, [Guid]::Empty) | Out-Null
"Volume set to ${pct}%"`;
  const out = runPS(script);
  return { ok: true, volume: pct, result: out };
}

function openFile(file) {
  const escaped = file.replace(/'/g, "''");
  const script  = `Start-Process '${escaped}'`;
  runPS(script);
  return { ok: true, file };
}

// Safety check for run_powershell
const BLOCKED_PS = [
  /Remove-Item\s+-Recurse\s+-Force\s+[A-Z]:\\/i,
  /Format-Volume/i,
  /Clear-Disk/i,
  /Initialize-Disk/i,
  /Get-BitLockerVolume.*Disable/i,
  /Stop-Computer|Restart-Computer/i,
];

function runPowershell(script) {
  for (const pat of BLOCKED_PS) {
    if (pat.test(script)) {
      return { ok: false, error: `Blocked: dangerous PowerShell pattern detected (${pat.toString()})` };
    }
  }
  const out = runPS(script);
  return { ok: true, output: out };
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

module.exports = async function windowsControl(input = {}) {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'windows-control only available on Windows' };
  }

  const { action, x, y, button, text, keys, process: proc, pid, args,
          title, handle, message, heading, script, volume, file } = input;

  try {
    switch (action) {
      case 'screenshot':       return screenshot();
      case 'mouse_move':       return mouseMove(x ?? 0, y ?? 0);
      case 'mouse_click':      return mouseClick(x ?? 0, y ?? 0, button || 'left');
      case 'type_text':        return typeText(text || '');
      case 'key_press':        return keyPress(keys || 'ENTER');
      case 'get_clipboard':    return getClipboard();
      case 'set_clipboard':    return setClipboard(text || '');
      case 'list_processes':   return listProcesses();
      case 'start_process':    return startProcess(proc || '', args || '');
      case 'kill_process':     return killProcess(proc, pid);
      case 'list_windows':     return listWindows();
      case 'focus_window':     return focusWindow(title, handle);
      case 'minimize_window':  return minimizeWindow(title, handle);
      case 'maximize_window':  return maximizeWindow(title, handle);
      case 'system_info':      return systemInfo();
      case 'send_notification':return sendNotification(message || '', heading || 'Octopus');
      case 'set_volume':       return setVolume(volume ?? 50);
      case 'open_file':        return openFile(file || '');
      case 'run_powershell':   return runPowershell(script || '');
      default:
        return { ok: false, error: `Unknown action: ${action}` };
    }
  } catch (err) {
    return { ok: false, error: err.message, action };
  }
};
