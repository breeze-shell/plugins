#Requires -Version 5.1
# 真实鼠标驱动编辑器窗口并逐步截图 (先跑 sandbox-e2e.ps1; -Steps 语法见 e2e\README.md)
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $Steps,
    [string] $Root,
    [string] $Worktree = 'ctx-menu-editor',
    [string] $WindowTitle = '右键菜单编辑器',
    [string] $Out = 'test\out',
    [switch] $RebuildHost
)

$ErrorActionPreference = 'Stop'

if (-not $Root) { $Root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) }
$Root = (Resolve-Path -LiteralPath $Root).ProviderPath
$pluginDir = Split-Path -Parent $PSScriptRoot

$caseDir = Join-Path $Root ".work\$Worktree"
$configFile = Join-Path $caseDir 'home\.breeze-shell\config\右键菜单编辑器\config.json'
$outDir = Join-Path $caseDir 'out'

if (-not (Test-Path -LiteralPath $configFile)) {
    throw "沙箱里还没有演示配置, 先跑一次 plugins\context-menu-editor\test\sandbox-e2e.ps1"
}

$backup = "$configFile.interact-backup"
Copy-Item -LiteralPath $configFile -Destination $backup -Force

try {
    & (Join-Path $Root 'e2e\scenarios\run_js_script.ps1') -Root $Root -Worktree $Worktree -WindowTitle $WindowTitle -Steps $Steps -RebuildHost:$RebuildHost
} finally {
    Copy-Item -LiteralPath $backup -Destination $configFile -Force
    Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
}

$dest = Join-Path $pluginDir $Out
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Get-ChildItem -LiteralPath $dest -Filter '*.png' -File -ErrorAction SilentlyContinue | Remove-Item -Force
foreach ($png in @(Get-ChildItem -LiteralPath $outDir -Filter '*.png' -File -ErrorAction SilentlyContinue)) {
    Copy-Item -LiteralPath $png.FullName -Destination (Join-Path $dest $png.Name) -Force
}

Write-Host ''
Write-Host "---- 截图已复制到 $dest ----" -ForegroundColor DarkGray
Get-ChildItem -LiteralPath $dest -Filter '*.png' -File | Sort-Object Name | ForEach-Object {
    Write-Host ("  {0}  {1} kB" -f $_.Name, [math]::Round($_.Length / 1KB, 1)) -ForegroundColor DarkGray
}
