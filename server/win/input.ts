// Keyboard / media-key / text input and audio mute on Windows without native Node modules.
// A single long-lived PowerShell process compiles small C# wrappers (SendInput,
// Core Audio) once, then executes commands we write to its stdin (one per line).
// Protocol: "<id> <CMD> [args]"  ->  "OK <id> [result]" | "ERR <id> <message>"

import { spawn, type ChildProcessWithoutNullStreams } from "child_process";

const PS_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class SDAudio {
  [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr p);
    int UnregisterControlChangeNotify(IntPtr p);
    int GetChannelCount(out uint c);
    int SetMasterVolumeLevel(float l, ref Guid g);
    int SetMasterVolumeLevelScalar(float l, ref Guid g);
    int GetMasterVolumeLevel(out float l);
    int GetMasterVolumeLevelScalar(out float l);
    int SetChannelVolumeLevel(uint n, float l, ref Guid g);
    int SetChannelVolumeLevelScalar(uint n, float l, ref Guid g);
    int GetChannelVolumeLevel(uint n, out float l);
    int GetChannelVolumeLevelScalar(uint n, out float l);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool m, ref Guid g);
    int GetMute([MarshalAs(UnmanagedType.Bool)] out bool m);
  }
  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
  }
  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int flow, int mask, out IntPtr devs);
    int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice dev);
  }
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator {}

  // flow: 0 = render (speakers), 1 = capture (mic). Role 0 = default device.
  static IAudioEndpointVolume Endpoint(int flow) {
    var en = (IMMDeviceEnumerator)new MMDeviceEnumerator();
    IMMDevice dev;
    if (en.GetDefaultAudioEndpoint(flow, 0, out dev) != 0) throw new Exception(flow == 1 ? "No default microphone" : "No default speakers");
    var iid = typeof(IAudioEndpointVolume).GUID;
    object o;
    Marshal.ThrowExceptionForHR(dev.Activate(ref iid, 23, IntPtr.Zero, out o));
    return (IAudioEndpointVolume)o;
  }
  public static bool GetMute(int flow) { bool m; Marshal.ThrowExceptionForHR(Endpoint(flow).GetMute(out m)); return m; }
  public static bool SetMute(int flow, string op) {
    var ep = Endpoint(flow);
    bool m; Marshal.ThrowExceptionForHR(ep.GetMute(out m));
    bool target = op == "toggle" ? !m : op == "mute";
    var g = Guid.Empty;
    Marshal.ThrowExceptionForHR(ep.SetMute(target, ref g));
    return target;
  }
}
public static class SDInput {
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] struct UNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION u; }
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [DllImport("user32.dll", SetLastError = true)] static extern bool LockWorkStation();
  public static void Lock() { if (!LockWorkStation()) throw new Exception("LockWorkStation failed (" + Marshal.GetLastWin32Error() + ")"); }
  const uint KEYUP = 0x2, UNICODE = 0x4, EXTENDED = 0x1;
  static INPUT Key(ushort vk, ushort scan, uint flags) { var i = new INPUT(); i.type = 1; i.u.ki.wVk = vk; i.u.ki.wScan = scan; i.u.ki.dwFlags = flags; return i; }
  static bool IsExtended(ushort vk) { return (vk >= 0x21 && vk <= 0x28) || vk == 0x2D || vk == 0x2E || vk == 0x5B || vk == 0x5C || vk == 0x6F || (vk >= 0xA6 && vk <= 0xB7); }
  static void Send(INPUT[] a) { if (SendInput((uint)a.Length, a, Marshal.SizeOf(typeof(INPUT))) != a.Length) throw new Exception("SendInput failed (" + Marshal.GetLastWin32Error() + ")"); }
  public static void Combo(ushort[] vks) {
    var a = new INPUT[vks.Length * 2];
    for (int i = 0; i < vks.Length; i++) a[i] = Key(vks[i], 0, IsExtended(vks[i]) ? EXTENDED : 0);
    for (int i = 0; i < vks.Length; i++) { var vk = vks[vks.Length - 1 - i]; a[vks.Length + i] = Key(vk, 0, KEYUP | (IsExtended(vk) ? EXTENDED : 0)); }
    Send(a);
  }
  public static void Text(string s) {
    var a = new INPUT[s.Length * 2];
    for (int i = 0; i < s.Length; i++) { a[i * 2] = Key(0, s[i], UNICODE); a[i * 2 + 1] = Key(0, s[i], UNICODE | KEYUP); }
    Send(a);
  }
}
"@
[Console]::Out.WriteLine('READY')
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $parts = $line.Split(' ', 3)
  $id = $parts[0]
  $result = ''
  try {
    switch ($parts[1]) {
      'KEYS' { [SDInput]::Combo([uint16[]]($parts[2].Split(','))) }
      'LOCK' { [SDInput]::Lock() }
      'AUDIO' {
        $a = $parts[2].Split(' ')
        $flow = if ($a[0] -eq 'mic') { 1 } else { 0 }
        $muted = if ($a[1] -eq 'get') { [SDAudio]::GetMute($flow) } else { [SDAudio]::SetMute($flow, $a[1]) }
        $result = if ($muted) { '1' } else { '0' }
      }
      'TEXT' { [SDInput]::Text([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($parts[2]))) }
      default { throw "Unknown command $($parts[1])" }
    }
    [Console]::Out.WriteLine("OK $id $result")
  } catch {
    [Console]::Out.WriteLine("ERR $id " + ($_.Exception.Message -replace '\r?\n', ' '))
  }
}
`;

type Pending = { resolve: (result: string) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };

class InputHelper {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private ready: Promise<void> | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private buffer = "";

  private start(): Promise<void> {
    if (this.ready) return this.ready;
    const encoded = Buffer.from(PS_SCRIPT, "utf16le").toString("base64");
    const proc = spawn(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
      { windowsHide: true }
    );
    this.proc = proc;

    this.ready = new Promise<void>((resolve, reject) => {
      const startTimer = setTimeout(() => reject(new Error("Input helper did not start in time")), 15000);
      proc.stdout.setEncoding("utf8");
      proc.stdout.on("data", (chunk: string) => {
        this.buffer += chunk;
        let nl: number;
        while ((nl = this.buffer.indexOf("\n")) >= 0) {
          const line = this.buffer.slice(0, nl).trim();
          this.buffer = this.buffer.slice(nl + 1);
          if (line === "READY") {
            clearTimeout(startTimer);
            resolve();
          } else {
            this.handleLine(line);
          }
        }
      });
      proc.stderr.setEncoding("utf8");
      proc.stderr.on("data", (d: string) => {
        const msg = d.replace(/#< CLIXML/g, "").trim();
        if (msg) console.error("[input-helper]", msg);
      });
      proc.on("exit", (code) => {
        clearTimeout(startTimer);
        reject(new Error(`Input helper exited (code ${code})`));
        this.reset(new Error(`Input helper exited (code ${code})`));
      });
      proc.on("error", (err) => {
        clearTimeout(startTimer);
        reject(err);
        this.reset(err);
      });
    });
    // Allow a retry on the next call if startup fails.
    this.ready.catch(() => this.reset(new Error("Input helper failed to start")));
    return this.ready;
  }

  private handleLine(line: string) {
    const [status, idStr, ...rest] = line.split(" ");
    const p = this.pending.get(Number(idStr));
    if (!p) return;
    this.pending.delete(Number(idStr));
    clearTimeout(p.timer);
    if (status === "OK") p.resolve(rest.join(" "));
    else p.reject(new Error(rest.join(" ") || "Input helper error"));
  }

  private reset(err: Error) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
    this.proc = null;
    this.ready = null;
    this.buffer = "";
  }

  private async exec(command: string): Promise<string> {
    await this.start();
    const proc = this.proc;
    if (!proc) throw new Error("Input helper not running");
    const id = this.nextId++;
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Input helper timed out"));
      }, 5000);
      this.pending.set(id, { resolve, reject, timer });
      proc.stdin.write(`${id} ${command}\n`);
    });
  }

  /** Warm up so the first button press isn't delayed by C# compilation. */
  warmUp() {
    this.start().catch((e) => console.error("[input-helper] warm-up failed:", e.message));
  }

  async sendKeys(vks: number[]): Promise<void> {
    if (vks.length) await this.exec(`KEYS ${vks.join(",")}`);
  }

  async typeText(text: string): Promise<void> {
    if (text) await this.exec(`TEXT ${Buffer.from(text, "utf8").toString("base64")}`);
  }

  /** Get or change the default mic / speakers mute state. Resolves with the resulting "muted" value. */
  async audio(device: "mic" | "speakers", op: "get" | "toggle" | "mute" | "unmute"): Promise<boolean> {
    return (await this.exec(`AUDIO ${device} ${op}`)).trim() === "1";
  }

  /** Lock the PC. Windows ignores a synthesized Win+L, so this calls LockWorkStation directly. */
  async lockWorkstation(): Promise<void> {
    await this.exec("LOCK");
  }

  stop() {
    if (this.proc) {
      this.proc.stdin.end();
      this.proc.kill();
    }
    this.reset(new Error("Input helper stopped"));
  }
}

export const inputHelper = new InputHelper();
