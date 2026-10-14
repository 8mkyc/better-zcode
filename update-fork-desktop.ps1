# update-fork-desktop.ps1 —— 桌面一键更新入口（确定性流程：关 ZCode → 更新 → 自动重开）
# 桌面快捷方式「ZCode改款更新」指向本脚本。全程可见进度，无时间猜测。
# 流程：UAC 提权 → （如在运行）征求同意后关闭 ZCode → 等句柄释放（锁探测）→
#       跑 update-fork.ps1（tsc→构建→解包→重包→原子替换）→ 成功自动启动 ZCode。

$ErrorActionPreference = 'Stop'
$Repo = 'C:\Users\c\code\ZCode'
$ZCodeExe = 'C:\Program Files\ZCode_mod\ZCode.exe'

# --- 自提权（写 C:\Program Files 需要管理员）---
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host '需要管理员权限，弹 UAC 请点"是"…' -ForegroundColor Yellow
    Start-Process pwsh -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Wait
    exit $LASTEXITCODE
}

$Host.UI.RawUI.WindowTitle = 'ZCode 改款更新'
Write-Host '======== ZCode 改款更新 ========' -ForegroundColor Cyan

# --- 1. 关闭 ZCode（征求同意）---
$procs = Get-Process ZCode -ErrorAction SilentlyContinue
if ($procs) {
    Write-Host ''
    Write-Host '检测到 ZCode 正在运行。更新需要先完全关闭它（未发送的草稿会丢失）。' -ForegroundColor Yellow
    Read-Host '回车 = 关闭 ZCode 并开始更新（取消请按 Ctrl+C）'
    Stop-Process -Name ZCode -Force -ErrorAction SilentlyContinue
    $deadline = (Get-Date).AddSeconds(30)
    while ((Get-Process ZCode -ErrorAction SilentlyContinue) -and ((Get-Date) -lt $deadline)) {
        Start-Sleep -Milliseconds 500
    }
    if (Get-Process ZCode -ErrorAction SilentlyContinue) {
        Write-Host 'ZCode 未能退出，取消更新。' -ForegroundColor Red
        Read-Host '回车关闭本窗口'
        exit 1
    }
}

# --- 2. 等 app.asar 句柄释放（上次就是这一步撞车导致 EBUSY）---
Write-Host ''
Write-Host '[前置] 检查 app.asar 是否已释放…' -ForegroundColor Cyan
$asarPath = 'C:\Program Files\ZCode_mod\resources\app.asar'
$released = $false
for ($i = 0; $i -lt 15; $i++) {
    try {
        $fs = [System.IO.File]::Open($asarPath, 'Open', 'ReadWrite', 'None')
        $fs.Close()
        $released = $true
        break
    } catch {
        Start-Sleep -Seconds 2
    }
}
if (-not $released) {
    Write-Host 'app.asar 仍被占用（30 秒未释放，可能是杀软扫描/残留进程）。稍后重新双击本快捷方式即可。' -ForegroundColor Red
    Read-Host '回车关闭本窗口'
    exit 1
}
Write-Host 'app.asar 已释放 ✔' -ForegroundColor Green

# --- 3. 跑更新（全程可见进度，约 3 分钟）---
Write-Host ''
& (Join-Path $Repo 'update-fork.ps1')
if ($LASTEXITCODE -eq 0) {
    Write-Host ''
    Write-Host '======== 更新完成 ✔ 正在启动 ZCode ========' -ForegroundColor Green
    if (Test-Path $ZCodeExe) {
        Start-Process $ZCodeExe
        Write-Host 'ZCode 已启动。验证：hover「上下文占用」→ 第三方余额段（今日已用 / MiMo 设置 Cookie）。' -ForegroundColor Green
    }
} else {
    Write-Host ''
    Write-Host '======== 更新失败 ========' -ForegroundColor Red
    Write-Host '原因见上方输出；也可让 AI 读 C:\Users\c\code\ZCode\update-fork-last-run.log 排查。' -ForegroundColor Red
}
Read-Host '回车关闭本窗口'
