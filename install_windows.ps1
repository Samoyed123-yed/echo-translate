[CmdletBinding()]
param(
    [switch]$InstallPdf,
    [switch]$InstallCodex,
    [string]$DesktopDirectory = [Environment]::GetFolderPath('Desktop')
)
$ErrorActionPreference = 'Stop'
$appDirectory = $PSScriptRoot

# Follow the same Python selection order as start_windows.bat.
$pythonCommand = Get-Command py.exe -ErrorAction SilentlyContinue
$pythonArgs = @('-3')
if (-not $pythonCommand) {
    $pythonCommand = Get-Command python.exe -ErrorAction SilentlyContinue
    $pythonArgs = @()
}
if (-not $pythonCommand) {
    throw 'Install Python 3.10+ from https://www.python.org/downloads/windows/ and select Add Python to PATH. Then reopen PowerShell.'
}
$pythonExe = $pythonCommand.Source
& $pythonExe @pythonArgs -c 'import sys; print(sys.version.split()[0]); sys.exit(0 if sys.version_info >= (3,10) else 1)'
if ($LASTEXITCODE -ne 0) {
    throw 'The launcher-selected Python must be 3.10+. Install/update Python from python.org, select Add Python to PATH, then reopen PowerShell.'
}

$chromeCandidates = @()
foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA)) {
    if ($base) { $chromeCandidates += Join-Path $base 'Google\Chrome\Application\chrome.exe' }
}
foreach ($key in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe')) {
    if (Test-Path -LiteralPath $key) { $chromeCandidates += (Get-Item -LiteralPath $key).GetValue('') }
}
$chrome = $null
foreach ($candidate in $chromeCandidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        $version = (Get-Item -LiteralPath $candidate).VersionInfo.ProductVersion
        if ($version -match '^(\d+)' -and [int]$Matches[1] -ge 138) { $chrome = $candidate; break }
    }
}
if (-not $chrome) { throw 'Install or update Google Chrome to version 138+ from https://www.google.com/chrome/ and rerun this script.' }
Write-Host "Chrome: $chrome"

if ($InstallPdf) {
    & $pythonExe @pythonArgs -m pip install pypdf
    if ($LASTEXITCODE -ne 0) { throw 'Optional PDF support installation failed. Rerun without -InstallPdf to install the basic app.' }
}
if ($InstallCodex) {
    if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
        $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
        if (-not $npmCommand) { throw 'Install Node.js LTS from https://nodejs.org/ and reopen the installer to enable Codex analysis.' }
        & $npmCommand.Source install -g @openai/codex
        if ($LASTEXITCODE -ne 0) { throw 'Codex CLI installation failed. Check npm output and retry.' }
    }
    Write-Host 'Codex CLI is available. Use codex login with YOUR account if you are not already signed in.'
}
Push-Location $appDirectory
try {
    & $pythonExe @pythonArgs -m unittest discover -s tests
    if ($LASTEXITCODE -ne 0) { throw 'Application tests failed; shortcut was not created.' }
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($nodeCommand) {
        & $nodeCommand.Source --check public/app.js
        if ($LASTEXITCODE -ne 0) { throw 'JavaScript syntax check failed.' }
        & $nodeCommand.Source --test tests/test_live_pipeline.cjs
        if ($LASTEXITCODE -ne 0) { throw 'Front-end tests failed.' }
    }
} finally { Pop-Location }
$launcher = Join-Path $appDirectory 'start_windows.bat'
if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) { throw 'Extract the entire package before running this script.' }
if (-not $DesktopDirectory) { throw 'Desktop folder could not be located.' }
New-Item -ItemType Directory -Path $DesktopDirectory -Force | Out-Null
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $DesktopDirectory 'Echo Translate.lnk'))
$shortcut.TargetPath = $launcher
$shortcut.WorkingDirectory = $appDirectory
$shortcut.Description = 'Echo Translate - local classroom translation'
$shortcut.IconLocation = "$chrome,0"
$shortcut.Save()

$port = if ($env:ECHO_TRANSLATE_PORT) { $env:ECHO_TRANSLATE_PORT } else { '8765' }
Write-Host 'Desktop shortcut created: Echo Translate. Running this installer again updates the same shortcut.'
Write-Host "Double-click the shortcut, then visit http://127.0.0.1:$port in Google Chrome."
Write-Host 'The launcher opens your default browser. If it is not Chrome, copy the URL into Chrome.'
Write-Host 'Allow microphone access on first use. Chrome may download the translation language pack.'
Write-Host 'No administrator privileges are required. Keep the extracted folder at this location.'
