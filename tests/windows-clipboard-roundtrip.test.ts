import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { CLIPBOARD_HELPER_SCRIPT } from "../electron/main/selection/windows-text-sources";

const execFileAsync = promisify(execFile);
const windowsTest = process.platform === "win32" ? it : it.skip;

const ROUNDTRIP_SCRIPT = String.raw`
$tempFile = [System.IO.Path]::GetTempFileName()
$userSnapshot = $null
try {
  $userSnapshot = Copy-ClipboardData
  [System.IO.File]::WriteAllText($tempFile, 'lexiflow-clipboard-roundtrip')
  $bitmap = New-Object System.Drawing.Bitmap 2, 2
  $bitmap.SetPixel(0, 0, [System.Drawing.Color]::Red)
  $files = New-Object System.Collections.Specialized.StringCollection
  [void]$files.Add($tempFile)
  $data = New-Object System.Windows.Forms.DataObject
  $data.SetText('plain-text')
  $data.SetData([System.Windows.Forms.DataFormats]::Html, '<html>roundtrip</html>')
  $data.SetData([System.Windows.Forms.DataFormats]::Rtf, '{\rtf1\ansi roundtrip}')
  $data.SetImage($bitmap)
  $data.SetFileDropList($files)
  $data.SetData('LexiFlowClipboardTest', 'custom-payload')
  [System.Windows.Forms.Clipboard]::SetDataObject($data, $true, 4, 50)

  $snapshot = Copy-ClipboardData
  [System.Windows.Forms.Clipboard]::SetText('overwrite')
  $restored = Restore-ClipboardData $snapshot
  $after = [System.Windows.Forms.Clipboard]::GetDataObject()

  $htmlValue = $null
  try { $htmlValue = [string]$after.GetData([System.Windows.Forms.DataFormats]::Html, $false) } catch {}
  $rtfValue = $null
  try { $rtfValue = [string]$after.GetData([System.Windows.Forms.DataFormats]::Rtf, $false) } catch {}
  $custom = $null
  try { $custom = [string]$after.GetData('LexiFlowClipboardTest', $false) } catch {}
  $imageOk = $false
  try {
    $img = [System.Windows.Forms.Clipboard]::GetImage()
    if ($null -ne $img) { $imageOk = ($img.GetPixel(0, 0).R -eq 255) }
  } catch {}
  $fileOk = $false
  try {
    $drop = [System.Windows.Forms.Clipboard]::GetFileDropList()
    if ($null -ne $drop -and $drop.Count -gt 0) { $fileOk = ($drop[0] -eq $tempFile) }
  } catch {}

  [pscustomobject]@{
    restored = [bool]$restored
    text = ([System.Windows.Forms.Clipboard]::GetText() -eq 'plain-text')
    html = ($htmlValue -match 'roundtrip')
    rtf = ($rtfValue -match 'roundtrip')
    image = [bool]$imageOk
    files = [bool]$fileOk
    custom = ($custom -eq 'custom-payload')
    leftoverMarker = ([System.Windows.Forms.Clipboard]::GetText() -like '*__LEXIFLOW_*')
  } | ConvertTo-Json -Compress
} finally {
  if ($null -ne $userSnapshot) { Restore-ClipboardData $userSnapshot | Out-Null }
  Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
}
`;

interface RoundtripResult {
  restored: boolean;
  text: boolean;
  html: boolean;
  rtf: boolean;
  image: boolean;
  files: boolean;
  custom: boolean;
  leftoverMarker: boolean;
}

windowsTest("剪贴板快照能往返文本、HTML、RTF、图片、文件列表和自定义格式", async () => {
  const scriptPath = join(tmpdir(), `lexiflow-clipboard-roundtrip-${randomUUID()}.ps1`);
  await writeFile(scriptPath, `${CLIPBOARD_HELPER_SCRIPT}\n${ROUNDTRIP_SCRIPT}`, "utf8");
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Sta", "-WindowStyle", "Hidden", "-File", scriptPath],
      { windowsHide: true, timeout: 15_000, maxBuffer: 1024 * 1024 }
    );
    const result = JSON.parse(stdout.trim()) as RoundtripResult;
    expect(result.restored).toBe(true);
    expect(result.text).toBe(true);
    expect(result.html).toBe(true);
    expect(result.rtf).toBe(true);
    expect(result.image).toBe(true);
    expect(result.files).toBe(true);
    expect(result.custom).toBe(true);
    expect(result.leftoverMarker).toBe(false);
  } finally {
    await unlink(scriptPath).catch(() => undefined);
  }
}, 20_000);
