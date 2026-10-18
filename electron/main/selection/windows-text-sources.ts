import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { textFromClipboardCapture, type ClipboardCaptureResult } from "./clipboard-capture";
import type { SelectionTextSource } from "./text-reader";

const execFileAsync = promisify(execFile);
const COMMAND_LENGTH_LIMIT = 6_000;

const UI_AUTOMATION_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$element = [System.Windows.Automation.AutomationElement]::FocusedElement
if ($null -eq $element) { exit 2 }
$pattern = $null
if (-not $element.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$pattern)) { exit 3 }
$parts = @($pattern.GetSelection() | ForEach-Object { $_.GetText(-1) })
$text = $parts -join ''
if ([string]::IsNullOrWhiteSpace($text)) { exit 4 }
[Console]::Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($text)))
`;

export const CLIPBOARD_HELPER_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber();' -Name Native -Namespace LexiFlow

function Copy-ClipboardData {
  $source = [System.Windows.Forms.Clipboard]::GetDataObject()
  $copy = New-Object System.Windows.Forms.DataObject
  if ($null -eq $source) { return $copy }
  foreach ($format in $source.GetFormats($false)) {
    try {
      $value = $source.GetData($format, $false)
      if ($null -ne $value) { $copy.SetData($format, $false, $value) }
    } catch {}
  }
  return $copy
}

function Restore-ClipboardData($copy) {
  for ($attempt = 0; $attempt -lt 4; $attempt += 1) {
    try {
      [System.Windows.Forms.Clipboard]::SetDataObject($copy, $true, 4, 50)
      return $true
    } catch {
      Start-Sleep -Milliseconds 25
    }
  }
  return $false
}
`;

const CLIPBOARD_CAPTURE_SCRIPT = `${CLIPBOARD_HELPER_SCRIPT}
${String.raw`
function Write-Result([string]$Status, [string]$Text) {
  $json = @{ status = $Status; text = $Text } | ConvertTo-Json -Compress
  [Console]::Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json)))
}

$snapshot = Copy-ClipboardData
$beforeSequence = [LexiFlow.Native]::GetClipboardSequenceNumber()
$ownedSequence = $null
try {
  $wscript = New-Object -ComObject WScript.Shell
  $wscript.SendKeys('^c')

  $deadline = [DateTime]::UtcNow.AddMilliseconds(800)
  do {
    Start-Sleep -Milliseconds 20
    $copySequence = [LexiFlow.Native]::GetClipboardSequenceNumber()
  } while (($copySequence -eq $beforeSequence) -and ([DateTime]::UtcNow -lt $deadline))

  if ($copySequence -eq $beforeSequence) {
    Write-Result 'copy-timeout' ''
    exit 0
  }

  $ownedSequence = [LexiFlow.Native]::GetClipboardSequenceNumber()
  $selectedText = [System.Windows.Forms.Clipboard]::GetText()
  Start-Sleep -Milliseconds 50
  $currentSequence = [LexiFlow.Native]::GetClipboardSequenceNumber()

  if ($currentSequence -eq $ownedSequence) {
    if (-not (Restore-ClipboardData $snapshot)) {
      $ownedSequence = $null
      Write-Result 'restore-failed' ''
      exit 0
    }
    $ownedSequence = $null
  } else {
    $ownedSequence = $null
  }

  if ([string]::IsNullOrWhiteSpace($selectedText)) {
    Write-Result 'empty' ''
    exit 0
  }
  Write-Result 'ok' $selectedText
} catch {
  if ($null -ne $ownedSequence) {
    $currentSequence = [LexiFlow.Native]::GetClipboardSequenceNumber()
    if ($currentSequence -eq $ownedSequence) { Restore-ClipboardData $snapshot | Out-Null }
  }
  exit 1
}
`}`;

type PowerShellRunner = (script: string, timeout: number) => Promise<string>;

export class WindowsAutomationTextSource implements SelectionTextSource {
  constructor(private readonly run: PowerShellRunner = runPowerShell) {}

  async read(): Promise<string | undefined> {
    try {
      const encoded = await this.run(UI_AUTOMATION_SCRIPT, 2_000);
      return decodeBase64(encoded);
    } catch {
      return undefined;
    }
  }
}

export class WindowsClipboardTextSource implements SelectionTextSource {
  constructor(private readonly run: PowerShellRunner = runPowerShell) {}

  async read(): Promise<string | undefined> {
    const encoded = await this.run(CLIPBOARD_CAPTURE_SCRIPT, 4_000);
    const result = JSON.parse(decodeBase64(encoded)) as ClipboardCaptureResult;
    return textFromClipboardCapture(result);
  }
}

async function runPowerShell(script: string, timeout: number): Promise<string> {
  const args = ["-NoProfile", "-NonInteractive", "-Sta", "-WindowStyle", "Hidden"];
  let tempFile: string | undefined;
  if (Buffer.byteLength(script, "utf8") > COMMAND_LENGTH_LIMIT) {
    tempFile = join(tmpdir(), `lexiflow-selection-${randomUUID()}.ps1`);
    await writeFile(tempFile, script, "utf8");
    args.push("-File", tempFile);
  } else {
    args.push("-Command", script);
  }
  try {
    const { stdout } = await execFileAsync("powershell.exe", args, {
      windowsHide: true,
      timeout,
      maxBuffer: 8 * 1024 * 1024
    });
    return stdout.trim();
  } finally {
    if (tempFile) await unlink(tempFile).catch(() => undefined);
  }
}

function decodeBase64(value: string): string {
  if (!value) return "";
  return Buffer.from(value, "base64").toString("utf8");
}
