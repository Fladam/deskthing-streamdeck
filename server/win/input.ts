// Keyboard / media-key / text input on Windows without native Node modules.
// A single long-lived PowerShell process compiles a tiny SendInput wrapper once,
// then executes commands we write to its stdin (one per line).

import { spawn, type ChildProcessWithoutNullStreams } from "child_process";

const PS_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
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
  try {
    switch ($parts[1]) {
      'KEYS' { [SDInput]::Combo([uint16[]]($parts[2].Split(','))) }
      'LOCK' { [SDInput]::Lock() }
      'TEXT' { [SDInput]::Text([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($parts[2]))) }
      default { throw "Unknown command $($parts[1])" }
    }
    [Console]::Out.WriteLine("OK $id")
  } catch {
    [Console]::Out.WriteLine("ERR $id " + ($_.Exception.Message -replace '\r?\n', ' '))
  }
}
`;

type Pending = { resolve: () => void; reject: (e: Error) => void; timer: NodeJS.Timeout };

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
    if (status === "OK") p.resolve();
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

  private async exec(command: string): Promise<void> {
    await this.start();
    const proc = this.proc;
    if (!proc) throw new Error("Input helper not running");
    const id = this.nextId++;
    return new Promise<void>((resolve, reject) => {
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

  sendKeys(vks: number[]) {
    if (vks.length === 0) return Promise.resolve();
    return this.exec(`KEYS ${vks.join(",")}`);
  }

  typeText(text: string) {
    if (!text) return Promise.resolve();
    return this.exec(`TEXT ${Buffer.from(text, "utf8").toString("base64")}`);
  }

  /** Lock the PC. Windows ignores a synthesized Win+L, so this calls LockWorkStation directly. */
  lockWorkstation() {
    return this.exec("LOCK");
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
