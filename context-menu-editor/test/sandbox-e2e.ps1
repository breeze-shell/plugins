#Requires -Version 5.1
# 在 e2e 沙箱里跑「右键菜单编辑器」: 沙箱 home + 编译成 explorer.exe 的宿主进程 + 真实 shell.dll。
#
# 两段:
#   1) menu 场景   - 真实 TrackPopupMenuEx 走一遍采集与规则重建 (断言从 debug.log 里读)
#   2) js-interact - 探针打开编辑器窗口, 宿主截图 (产物 docs/window-preview.png)
#
# 前置: 先跑过一次 ..\..\e2e\run.ps1 (它会编译宿主进程), 被测 shell 是 worktree 里的构建产物。
# 参数: -Root / -Worktree / -WindowTitle / -RebuildHost / -SkipWindow
[CmdletBinding()]
param(
    [string] $Root,
    [string] $Worktree = 'ctx-menu-editor',
    [string] $WindowTitle = '右键菜单编辑器',
    [switch] $RebuildHost,
    [switch] $SkipWindow
)

$ErrorActionPreference = 'Stop'

if (-not $Root) { $Root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) }
$Root = (Resolve-Path -LiteralPath $Root).ProviderPath
$pluginDir = Join-Path $Root 'plugins\context-menu-editor'
$bundle = Join-Path $Root 'plugins\context-menu-editor.js'

Write-Host ''
Write-Host '==========================================================' -ForegroundColor DarkGray
Write-Host '  右键菜单编辑器  --  沙箱 e2e (真实 shell.dll + 真实 QuickJS)' -ForegroundColor White
Write-Host '==========================================================' -ForegroundColor DarkGray

if (-not (Test-Path -LiteralPath $bundle)) {
    Write-Host '构建插件…' -ForegroundColor Cyan
    Push-Location $pluginDir
    try { & node build.mjs } finally { Pop-Location }
}
if (-not (Test-Path -LiteralPath $bundle)) { throw "找不到构建产物: $bundle" }
Write-Host ("插件产物: {0} ({1} kB)" -f $bundle, [math]::Round((Get-Item $bundle).Length / 1KB, 1)) -ForegroundColor DarkGray

# run.ps1 -Worktree 用的沙箱是 .work\<worktree>, 插件与配置要放到同一个 home 里
$caseDir = Join-Path $Root ".work\$Worktree"
$homeDir = Join-Path $caseDir 'home'
$dataDir = Join-Path $homeDir '.breeze-shell'
$scriptsDir = Join-Path $dataDir 'scripts'
$configDir = Join-Path $dataDir 'config\context-menu-editor'
$outDir = Join-Path $caseDir 'out'

foreach ($dir in @($scriptsDir, $configDir, $outDir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}
Get-ChildItem -LiteralPath $scriptsDir -Filter *.js -ErrorAction SilentlyContinue | Remove-Item -Force
Copy-Item -LiteralPath $bundle -Destination (Join-Path $scriptsDir 'context-menu-editor.js') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'probe.js') -Destination (Join-Path $scriptsDir 'probe.js') -Force
Set-Content -LiteralPath (Join-Path $configDir '.e2e') -Value 'sandbox e2e hook' -Encoding ASCII

Write-Host '沙箱 scripts:' -ForegroundColor DarkGray
Get-ChildItem -LiteralPath $scriptsDir | ForEach-Object { Write-Host "  $($_.Name)" -ForegroundColor DarkGray }

$child = if (Get-Command pwsh -ErrorAction SilentlyContinue) { 'pwsh' } else { 'powershell.exe' }

function Invoke-Scenario {
    param([string] $Scenario, [string] $Title)

    $runArgs = @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $Root 'e2e\run.ps1'),
        '-Scenario', $Scenario, '-Worktree', $Worktree
    )
    if ($Title) { $runArgs += @('-WindowTitle', $Title) }
    if ($RebuildHost) { $runArgs += '-RebuildHost' }

    # run.ps1 里有 exit, 必须在子进程里跑, 否则会一起结束当前会话。
    # 子进程输出走 Out-Host, 免得混进函数的返回值里。
    & {
        $ErrorActionPreference = 'Continue'
        & $child @runArgs 2>&1 | Out-Host
    }
    return $LASTEXITCODE
}

$menuExit = Invoke-Scenario -Scenario 'menu'

$dbgLog = Join-Path $dataDir 'debug.log'
$dbgText = if (Test-Path -LiteralPath $dbgLog) { Get-Content -LiteralPath $dbgLog -Raw } else { '' }
$lines = ($dbgText -split "`r?`n") | Where-Object { $_ -match '\[cme-e2e\]' }
$fails = @($lines | Where-Object { $_ -match 'FAIL' })
$passes = @($lines | Where-Object { $_ -match 'PASS' })

Write-Host ''
Write-Host '---- 探针结果 (menu 场景) ----' -ForegroundColor DarkGray
foreach ($line in $lines) {
    $text = ($line -replace '^.*\[cme-e2e\]\s*', '').Trim()
    if ($text -match '^FAIL') { Write-Host "  [FAIL] $text" -ForegroundColor Red }
    elseif ($text -match '^PASS') { Write-Host "  [ OK ] $text" -ForegroundColor Green }
    else { Write-Host "         $text" -ForegroundColor DarkGray }
}

$checks = @(
    [pscustomobject]@{ Name = '探针跑完 (DONE)'; Pass = (@($lines | Where-Object { $_ -match 'DONE' }).Count -gt 0) }
    [pscustomobject]@{ Name = '插件暴露了 e2e 入口'; Pass = (@($lines | Where-Object { $_ -match 'PASS hook' }).Count -gt 0) }
    [pscustomobject]@{ Name = '探针断言全部通过'; Pass = ($fails.Count -eq 0 -and $passes.Count -ge 9) }
    [pscustomobject]@{ Name = '真实菜单被原样保留'; Pass = (@($lines | Where-Object { $_ -match 'PASS 规则未启用时菜单原样保留' }).Count -gt 0) }
    [pscustomobject]@{ Name = '重建后的项保留原生身份'; Pass = (@($lines | Where-Object { $_ -match 'PASS 子项保留' }).Count -ge 3) }
    [pscustomobject]@{ Name = '重建后的项仍能触发原动作'; Pass = (@($lines | Where-Object { $_ -match 'PASS 重建后的项仍触发原动作' }).Count -gt 0) }
    [pscustomobject]@{ Name = '插件在真实运行时里没有报错'; Pass = ($dbgText -notmatch 'Unknown property|Unknown component|Invalid hook call|Error in JS menu callback|Error in menu listener') }
)

$bmp = Join-Path $outDir 'js-window.bmp'
$png = $null
if (-not $SkipWindow) {
    Remove-Item -LiteralPath $bmp -ErrorAction SilentlyContinue
    $windowExit = Invoke-Scenario -Scenario 'js-interact' -Title $WindowTitle
    $dbgText = if (Test-Path -LiteralPath $dbgLog) { Get-Content -LiteralPath $dbgLog -Raw } else { '' }
    $checks += [pscustomobject]@{ Name = '编辑器窗口被打开'; Pass = ($dbgText -match 'PASS window-opened') }
    $checks += [pscustomobject]@{ Name = '窗口截图已生成'; Pass = (Test-Path -LiteralPath $bmp) }
    if ($windowExit -ne 0 -and -not (Test-Path -LiteralPath $bmp)) {
        Write-Host "js-interact 场景退出码 $windowExit" -ForegroundColor DarkYellow
    }
}

Write-Host ''
Write-Host '---- 断言 ----' -ForegroundColor DarkGray
foreach ($check in $checks) {
    $tag = if ($check.Pass) { '[ OK ]' } else { '[FAIL]' }
    $color = if ($check.Pass) { 'Green' } else { 'Red' }
    Write-Host "  $tag $($check.Name)" -ForegroundColor $color
}

if (Test-Path -LiteralPath $bmp) {
    Add-Type -AssemblyName System.Drawing
    $image = [System.Drawing.Image]::FromFile($bmp)
    $docsDir = Join-Path $PSScriptRoot '..\docs'
    New-Item -ItemType Directory -Force -Path $docsDir | Out-Null
    $png = Join-Path (Resolve-Path -LiteralPath $docsDir).ProviderPath 'window-preview.png'
    $image.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
    $image.Dispose()
    Write-Host ''
    Write-Host ("窗口截图: {0} ({1} kB)" -f $png, [math]::Round((Get-Item $png).Length / 1KB, 1)) -ForegroundColor Cyan
}

$failed = @($checks | Where-Object { -not $_.Pass })
Write-Host ''
if ($failed.Count -gt 0 -or $menuExit -ne 0) {
    Write-Host "e2e 失败 (断言 $($failed.Count) 项失败, run.ps1 退出码 $menuExit)" -ForegroundColor Red
    exit 1
}
Write-Host 'e2e 通过' -ForegroundColor Green
exit 0
