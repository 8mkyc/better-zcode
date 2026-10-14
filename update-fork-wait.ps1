# update-fork-wait.ps1 —— 守候式推送：等 ZCode 退出后自动跑 update-fork.ps1
# 用法：被 Start-Process -Verb RunAs 拉起（需管理员）；用户退出 ZCode 即自动开始。
# 产物日志：C:\Users\c\code\ZCode\update-fork-last-run.log

$ErrorActionPreference = 'Stop'
$Repo = 'C:\Users\c\code\ZCode'
$Log = Join-Path $Repo 'update-fork-last-run.log'
$Deadline = (Get-Date).AddMinutes(30)

function Write-Log([string]$msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $msg
    Add-Content -Path $Log -Value $line -Encoding UTF8
    Write-Host $line
}

Set-Content -Path $Log -Value ("# update-fork 守候推送 " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')) -Encoding UTF8

# 等 ZCode 退出（最多 30 分钟）
while (Get-Process ZCode -ErrorAction SilentlyContinue) {
    if ((Get-Date) -gt $Deadline) {
        Write-Log '等待超时（30 分钟内 ZCode 未退出），放弃。'
        exit 1
    }
    Start-Sleep -Seconds 3
}
Write-Log 'ZCode 已退出，开始推送…'

& (Join-Path $Repo 'update-fork.ps1') *>> $Log
if ($LASTEXITCODE -eq 0) {
    Write-Log '推送完成 ✔ 可以重开 ZCode 验证（hover 上下文占用看「第三方余额」段）。'
} else {
    Write-Log "推送失败（exit=$LASTEXITCODE），详见上方日志；可手动重跑 update-fork.ps1。"
    exit 1
}
