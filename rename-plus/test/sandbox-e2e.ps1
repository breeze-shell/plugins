#Requires -Version 5.1
# 在 e2e 沙箱里跑「重命名 Plus」: 沙箱 home + 编译成 explorer.exe 的宿主进程 +
# 真实 shell.dll。探针 (test/probe.js) 在真实 QuickJS 运行时里建测试文件、套用
# 预设、撤销、打开窗口, 最后由宿主的 js-interact 场景给窗口截图。
#
# 前置: 先跑过一次 ..\..\e2e\run.ps1 (它会编译宿主进程)。
# 参数: -Root / -WindowTitle / -RebuildHost / -KeepSandbox
[CmdletBinding()]
param(
    [string] $Root,
    [string] $WindowTitle = '重命名 Plus',
    [string] $Preset = 'numbering',
    [string] $Worktree,
    [string] $Steps,
    [int] $EvidenceDelayMs = 0,
    [switch] $Single,
    [switch] $RebuildHost
)

$ErrorActionPreference = 'Stop'

if (-not $Root) { $Root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) }
$Root = (Resolve-Path -LiteralPath $Root).ProviderPath
$pluginDir = Join-Path $Root 'plugins\rename-plus'
$bundle = Join-Path $Root 'plugins\rename-plus.js'

Write-Host ''
Write-Host '==========================================================' -ForegroundColor DarkGray
Write-Host '  重命名 Plus  --  沙箱 e2e (真实 shell.dll + 真实 QuickJS)' -ForegroundColor White
Write-Host '==========================================================' -ForegroundColor DarkGray

if (-not (Test-Path -LiteralPath $bundle)) {
    Write-Host '构建插件…' -ForegroundColor Cyan
    Push-Location $pluginDir
    try { & node build.mjs } finally { Pop-Location }
}
if (-not (Test-Path -LiteralPath $bundle)) { throw "找不到构建产物: $bundle" }
Write-Host "插件产物: $bundle ($([math]::Round((Get-Item $bundle).Length / 1KB, 1)) kB)" -ForegroundColor DarkGray

$caseDir = Join-Path $Root ".work\$(if ($Worktree) { $Worktree } else { '_default' })"
$homeDir = Join-Path $caseDir 'home'
$dataDir = Join-Path $homeDir '.breeze-shell'
$scriptsDir = Join-Path $dataDir 'scripts'
$configDir = Join-Path $dataDir 'config\Rename+'
$outDir = Join-Path $caseDir 'out'

foreach ($dir in @($scriptsDir, $configDir, $outDir, (Join-Path $homeDir 'rp-data'))) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}
Get-ChildItem -LiteralPath $scriptsDir -Filter *.js -ErrorAction SilentlyContinue | Remove-Item -Force
Copy-Item -LiteralPath $bundle -Destination (Join-Path $scriptsDir 'rename-plus.js') -Force
$probe = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'probe.js') -Raw
$probe = $probe.Replace('__PRESET_ID__', $Preset).Replace('__SINGLE__', $(if ($Single) { 'true' } else { 'false' }))
[System.IO.File]::WriteAllText((Join-Path $scriptsDir 'probe.js'), $probe, [System.Text.UTF8Encoding]::new($false))
Set-Content -LiteralPath (Join-Path $configDir '.e2e') -Value 'sandbox e2e hook' -Encoding ASCII
# fresh plugin config every run: an interaction test must not leak params into the assertions
Remove-Item -LiteralPath (Join-Path $configDir 'config.json') -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $outDir 'js-window.bmp') -ErrorAction SilentlyContinue

Write-Host '沙箱 scripts:' -ForegroundColor DarkGray
Get-ChildItem -LiteralPath $scriptsDir | ForEach-Object { Write-Host "  $($_.Name)" -ForegroundColor DarkGray }

$scenario = if ($Steps) { 'js-script' } else { 'js-interact' }
$runArgs = @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $Root 'e2e\run.ps1'),
    '-Scenario', $scenario, '-WindowTitle', $WindowTitle
)
if ($Steps) { $runArgs += @('-Steps', $Steps) }
if ($EvidenceDelayMs -gt 0) { $runArgs += @('-EvidenceDelayMs', $EvidenceDelayMs) }
if ($RebuildHost) { $runArgs += '-RebuildHost' }
if ($Worktree) { $runArgs += @('-Worktree', $Worktree) }

# run.ps1 里有 exit, 必须在子进程里跑, 否则会一起结束当前会话。
$child = if (Get-Command pwsh -ErrorAction SilentlyContinue) { 'pwsh' } else { 'powershell.exe' }
& {
    $ErrorActionPreference = 'Continue'
    & $child @runArgs
}
$runExit = $LASTEXITCODE

$dbgLog = Join-Path $dataDir 'debug.log'
$dbgText = if (Test-Path -LiteralPath $dbgLog) { Get-Content -LiteralPath $dbgLog -Raw } else { '' }
$lines = ($dbgText -split "`r?`n") | Where-Object { $_ -match '\[rp-e2e\]' }
$fails = @($lines | Where-Object { $_ -match 'FAIL' })

Write-Host ''
Write-Host '---- 探针结果 ----' -ForegroundColor DarkGray
foreach ($line in $lines) {
    $text = ($line -replace '^.*\[rp-e2e\]\s*', '').Trim()
    if ($text -match '^FAIL') { Write-Host "  [FAIL] $text" -ForegroundColor Red }
    elseif ($text -match '^PASS') { Write-Host "  [ OK ] $text" -ForegroundColor Green }
    else { Write-Host "         $text" -ForegroundColor DarkGray }
}

$checks = @(
    [pscustomobject]@{ Name = '探针跑完 (DONE)';                       Pass = (@($lines | Where-Object { $_ -match 'DONE' }).Count -gt 0) }
    [pscustomobject]@{ Name = '插件暴露了 e2e 入口';                    Pass = (@($lines | Where-Object { $_ -match 'PASS hook' }).Count -gt 0) }
    [pscustomobject]@{ Name = '探针断言全部通过';                       Pass = ($fails.Count -eq 0 -and @($lines | Where-Object { $_ -match '^.*\[rp-e2e\] PASS' }).Count -ge 6) }
    [pscustomobject]@{ Name = '插件在真实运行时里没有报错';              Pass = ($dbgText -notmatch 'Unknown property|Unknown component|Invalid hook call') }
    [pscustomobject]@{ Name = '窗口截图已生成';                         Pass = (Test-Path -LiteralPath (Join-Path $outDir 'js-window.bmp')) }
)

Write-Host ''
Write-Host '---- 断言 ----' -ForegroundColor DarkGray
foreach ($check in $checks) {
    $tag = if ($check.Pass) { '[ OK ]' } else { '[FAIL]' }
    $color = if ($check.Pass) { 'Green' } else { 'Red' }
    Write-Host "  $tag $($check.Name)" -ForegroundColor $color
}

$bmp = Join-Path $outDir 'js-window.bmp'
if (Test-Path -LiteralPath $bmp) {
    Add-Type -AssemblyName System.Drawing
    Get-ChildItem -LiteralPath $outDir -Filter 'step-*.bmp' -ErrorAction SilentlyContinue | ForEach-Object {
        $stepImage = [System.Drawing.Image]::FromFile($_.FullName)
        $stepPng = Join-Path $outDir ($_.BaseName + '.png')
        $stepImage.Save($stepPng, [System.Drawing.Imaging.ImageFormat]::Png)
        $stepImage.Dispose()
        Write-Host "步进截图: $stepPng" -ForegroundColor DarkGray
    }
    $image = [System.Drawing.Image]::FromFile($bmp)
    $png = Join-Path $outDir 'js-window.png'
    $image.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
    $image.Dispose()
    Write-Host ''
    Write-Host "窗口截图: $png ($([math]::Round((Get-Item $png).Length / 1KB, 1)) kB)" -ForegroundColor Cyan
}

$failed = @($checks | Where-Object { -not $_.Pass })
Write-Host ''
if ($failed.Count -gt 0 -or $runExit -ne 0) {
    Write-Host "e2e 失败 (断言 $($failed.Count) 项失败, run.ps1 退出码 $runExit)" -ForegroundColor Red
    exit 1
}
Write-Host 'e2e 通过' -ForegroundColor Green
exit 0
