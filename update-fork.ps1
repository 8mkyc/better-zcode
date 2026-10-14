# update-fork.ps1 —— ZCode 改款免重装更新（日常迭代用）
# 用法：pwsh -File C:\Users\c\code\ZCode\update-fork.ps1
# 前提：已用安装包装过改款（ZCode_mod）；ZCode 已完全退出；脚本自动请求管理员权限。
# 原理：tsc 检查 → 只重建 desktop 包 → 解包已安装 app.asar → 覆盖新 out/ →
#       按上游官方 unpack 规则重包（app-asar-repack.mjs）→ 原子替换 asar+unpacked。
# 注意：改了依赖(node_modules)或合并上游新版本时，此脚本不够用，需全量 bundle + 重装。

$ErrorActionPreference = 'Stop'
$Repo = 'C:\Users\c\code\ZCode'
$InstallDir = 'C:\Program Files\ZCode_mod'
$AsarPath = Join-Path $InstallDir 'resources\app.asar'

# --- 自动提权（C:\Program Files 写入需要管理员）---
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host '需要管理员权限，弹 UAC 重启自身…' -ForegroundColor Yellow
    Start-Process pwsh -Verb RunAs -ArgumentList "-NoProfile -File `"$PSCommandPath`"" -Wait
    exit $LASTEXITCODE
}

# --- 前置检查 ---
if (Get-Process ZCode -ErrorAction SilentlyContinue) {
    Write-Host 'ZCode 还在运行，请先完全退出（含托盘）再跑本脚本。' -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $AsarPath)) { Write-Host "找不到 $AsarPath" -ForegroundColor Red; exit 1 }

Set-Location $Repo

# --- 1. 类型检查（快速失败，别把坏代码打进包）---
Write-Host '[1/5] tsc 类型检查…' -ForegroundColor Cyan
& .\node_modules\.bin\tsc.cmd -b packages/shared packages/ui
if ($LASTEXITCODE -ne 0) { Write-Host 'tsc 失败，中止。' -ForegroundColor Red; exit 1 }

# --- 2. 重建 desktop 包（依赖未变时约 1 分钟）---
Write-Host '[2/5] 重建 desktop 包…' -ForegroundColor Cyan
pnpm --filter '@zcode/desktop' run build
if ($LASTEXITCODE -ne 0) { Write-Host '构建失败，中止。' -ForegroundColor Red; exit 1 }

# --- 3. 解包现有 app.asar（保留其 node_modules 与 package.json）---
$Work = Join-Path $env:TEMP ("zcode-fork-update-" + (Get-Date -Format 'yyyyMMddHHmmss'))
New-Item -ItemType Directory -Path $Work | Out-Null
$Staging = Join-Path $Work 'app'
Write-Host "[3/5] 解包 app.asar 到 $Staging …" -ForegroundColor Cyan
$asarCli = Join-Path $Repo 'node_modules\@electron\asar\bin\asar.js'
& node $asarCli extract $AsarPath $Staging
if ($LASTEXITCODE -ne 0) { Write-Host '解包失败，中止。' -ForegroundColor Red; exit 1 }

# --- 4. 用新 out/ 覆盖 ---
Write-Host '[4/5] 覆盖新 out/ …' -ForegroundColor Cyan
$dest = Join-Path $Staging 'out'
if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
Copy-Item -Recurse -Force (Join-Path $Repo 'packages\desktop\out') $dest

# --- 5. 按上游官方规则重包 + 备份 + 原子替换 ---
Write-Host '[5/5] 重包并替换 app.asar（上游 unpack 规则）…' -ForegroundColor Cyan
Copy-Item -Force $AsarPath "$AsarPath.bak"
$env:ZCODE_FORK_STAGING = $Staging
$env:ZCODE_FORK_ASAR = $AsarPath
$repack = @'
import { spawnSync } from "node:child_process";
const mod = await import("file:///C:/Users/c/code/ZCode/packages/desktop/scripts/app-asar-repack.mjs");
const asarCli = "file:///C:/Users/c/code/ZCode/node_modules/@electron/asar/bin/asar.js";
await mod.replaceAppAsarFromStaging({
  sourceDir: process.env.ZCODE_FORK_STAGING,
  appAsarPath: process.env.ZCODE_FORK_ASAR,
  targetPlatformKey: "win32-x64",
  runAsarCommand: (args) => {
    const r = spawnSync("node", [new URL(asarCli).pathname.replace(/\//g, "\\"), ...args], { stdio: "inherit" });
    if (r.status !== 0) throw new Error("asar pack failed");
  },
});
console.log("REPACK_OK");
'@
$repack | Set-Content -Path (Join-Path $Work 'repack.mjs') -Encoding UTF8
& node (Join-Path $Work 'repack.mjs')
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $AsarPath)) {
    Write-Host "重包失败！已中止（原包是否完好请看 $AsarPath 与 .bak）。" -ForegroundColor Red
    exit 1
}
Remove-Item -Recurse -Force $Work -ErrorAction SilentlyContinue

Write-Host "完成 ✔  旧包备份在 $AsarPath.bak，启动 ZCode 验证。" -ForegroundColor Green
