#Requires -Version 5.1
# 在 e2e 沙箱里跑「右键菜单编辑器」: 沙箱 home + 编译成 explorer.exe 的宿主进程 + 真实 shell.dll。
#
# 三段:
#   1) menu/default - 真实 TrackPopupMenuEx 走一遍采集与规则重建 (断言从 debug.log 里读)
#   2) menu/rules   - 真规则作用在真实原生菜单上 (这一段会改掉宿主菜单, 所以单独跑一段)
#   3) js-interact  - 探针打开编辑器窗口, 宿主截图 (产物 docs/window-preview.png)
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
$dataDir = Join-Path $caseDir 'home\.breeze-shell'
$scriptsDir = Join-Path $dataDir 'scripts'
$configDir = Join-Path $dataDir 'config\右键菜单编辑器'
$dbgLog = Join-Path $dataDir 'debug.log'
$outDir = Join-Path $caseDir 'out'
$bmp = Join-Path $outDir 'js-window.bmp'

foreach ($dir in @($scriptsDir, $configDir, $outDir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}
Get-ChildItem -LiteralPath $scriptsDir -Filter *.js -ErrorAction SilentlyContinue | Remove-Item -Force
Copy-Item -LiteralPath $bundle -Destination (Join-Path $scriptsDir 'context-menu-editor.js') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'probe.js') -Destination (Join-Path $scriptsDir 'probe.js') -Force
# 每次从零开始: 上一轮留下的规则会让第一段就不再是"原生菜单"
Remove-Item -LiteralPath (Join-Path $configDir 'config.json') -ErrorAction SilentlyContinue
Set-Content -LiteralPath (Join-Path $configDir '.e2e') -Value 'sandbox e2e hook' -Encoding ASCII

Write-Host '沙箱 scripts:' -ForegroundColor DarkGray
Get-ChildItem -LiteralPath $scriptsDir | ForEach-Object { Write-Host "  $($_.Name)" -ForegroundColor DarkGray }

$child = if (Get-Command pwsh -ErrorAction SilentlyContinue) { 'pwsh' } else { 'powershell.exe' }

function Invoke-Phase {
    param([string] $Scenario, [string] $Phase, [string] $Title)

    Remove-Item -LiteralPath $dbgLog -ErrorAction SilentlyContinue
    $env:CME_E2E_PHASE = $Phase

    $runArgs = @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $Root 'e2e\run.ps1'),
        '-Scenario', $Scenario, '-Worktree', $Worktree
    )
    if ($Title) { $runArgs += @('-WindowTitle', $Title) }
    if ($RebuildHost) { $runArgs += '-RebuildHost' }

    # run.ps1 里有 exit, 必须在子进程里跑; 输出走 Out-Host, 免得混进函数的返回值里。
    & {
        $ErrorActionPreference = 'Continue'
        & $child @runArgs 2>&1 | Out-Host
    }
    $exit = $LASTEXITCODE
    $env:CME_E2E_PHASE = $null

    $text = if (Test-Path -LiteralPath $dbgLog) { Get-Content -LiteralPath $dbgLog -Raw -Encoding UTF8 } else { '' }
    [pscustomobject]@{
        Exit  = $exit
        Text  = $text
        Lines = @(($text -split "`r?`n") | Where-Object { $_ -match '\[cme-e2e\]' })
    }
}

function Show-ProbeLines {
    param($Phase)
    foreach ($line in $Phase.Lines) {
        $text = ($line -replace '^.*\[cme-e2e\]\s*', '').Trim()
        if ($text -match '^FAIL') { Write-Host "  [FAIL] $text" -ForegroundColor Red }
        elseif ($text -match '^PASS') { Write-Host "  [ OK ] $text" -ForegroundColor Green }
        else { Write-Host "         $text" -ForegroundColor DarkGray }
    }
}

$capture = Invoke-Phase -Scenario 'menu' -Phase 'default'
$captureFails = @($capture.Lines | Where-Object { $_ -match 'FAIL' })
$capturePasses = @($capture.Lines | Where-Object { $_ -match 'PASS' })

Write-Host ''
Write-Host '---- 探针结果 (menu/default: 采集 + 规则重建) ----' -ForegroundColor DarkGray
Show-ProbeLines $capture

# 规则段会边跑边把配置写回, 先备份, 跑完还原给截图段用
$configFile = Join-Path $configDir 'config.json'
$demoConfig = if (Test-Path -LiteralPath $configFile) { Get-Content -LiteralPath $configFile -Raw } else { $null }

$rules = Invoke-Phase -Scenario 'menu' -Phase 'rules'
$rulesFailLines = @($rules.Lines | Where-Object { $_ -match 'FAIL' })

if ($demoConfig) { [System.IO.File]::WriteAllText($configFile, $demoConfig, [System.Text.UTF8Encoding]::new($false)) }

Write-Host ''
Write-Host '---- 探针结果 (menu/rules: 规则作用在真实原生菜单) ----' -ForegroundColor DarkGray
Show-ProbeLines $rules

$checks = @(
    [pscustomobject]@{ Name = '探针跑完 (DONE)'; Pass = (@($capture.Lines | Where-Object { $_ -match 'DONE' }).Count -gt 0) }
    [pscustomobject]@{ Name = '插件暴露了 e2e 入口'; Pass = (@($capture.Lines | Where-Object { $_ -match 'PASS hook' }).Count -gt 0) }
    [pscustomobject]@{ Name = '采集与规则重建全部通过'; Pass = ($captureFails.Count -eq 0 -and $capturePasses.Count -ge 9) }
    [pscustomobject]@{ Name = '真实菜单被原样保留'; Pass = (@($capture.Lines | Where-Object { $_ -match 'PASS 规则未启用时菜单原样保留' }).Count -gt 0) }
    [pscustomobject]@{ Name = '重建后的项保留原生身份'; Pass = (@($capture.Lines | Where-Object { $_ -match 'PASS 子项保留' }).Count -ge 3) }
    [pscustomobject]@{ Name = '重建后的项仍能触发原动作'; Pass = (@($capture.Lines | Where-Object { $_ -match 'PASS 重建后的项仍触发原动作' }).Count -gt 0) }
    [pscustomobject]@{ Name = '规则能重塑真实原生菜单'; Pass = (@($rules.Lines | Where-Object { $_ -match 'PASS 真实原生菜单被重排' }).Count -gt 0 -and $rulesFailLines.Count -eq 0) }
    # Unknown binding setter: 给宿主组件传了没有 setter 的属性(例如 textbox 的 flexGrow),
    # 整个窗口会白掉, 所以这里必须算失败。
    [pscustomobject]@{ Name = '插件在真实运行时里没有报错'; Pass = ($capture.Text + $rules.Text -notmatch 'Unknown property|Unknown component|Unknown binding setter|Invalid hook call|Error in JS menu callback|Error in menu listener') }
)

if (-not $SkipWindow) {
    Remove-Item -LiteralPath $bmp -ErrorAction SilentlyContinue
    $window = Invoke-Phase -Scenario 'js-interact' -Phase 'window' -Title $WindowTitle
    $checks += [pscustomobject]@{ Name = '编辑器窗口被打开'; Pass = (@($window.Lines | Where-Object { $_ -match 'PASS window-opened' }).Count -gt 0) }
    $checks += [pscustomobject]@{ Name = '窗口截图已生成'; Pass = (Test-Path -LiteralPath $bmp) }
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
if ($failed.Count -gt 0 -or $capture.Exit -ne 0) {
    Write-Host "e2e 失败 (断言 $($failed.Count) 项失败, menu/default 退出码 $($capture.Exit))" -ForegroundColor Red
    exit 1
}
Write-Host 'e2e 通过' -ForegroundColor Green
exit 0
