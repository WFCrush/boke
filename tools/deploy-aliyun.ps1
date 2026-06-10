param(
  [string]$ServerHost = $env:BOKE_ALIYUN_HOST,
  [string]$SshUser = $env:BOKE_ALIYUN_USER,
  [string]$RepoPath = $env:BOKE_ALIYUN_REPO,
  [string]$Branch = $env:BOKE_ALIYUN_BRANCH,
  [string]$KeyPath = $env:BOKE_ALIYUN_KEY,
  [switch]$SkipBuild,
  [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location -LiteralPath $root

if ([string]::IsNullOrWhiteSpace($ServerHost)) { $ServerHost = '118.31.105.163' }
if ([string]::IsNullOrWhiteSpace($SshUser)) { $SshUser = 'git' }
if ([string]::IsNullOrWhiteSpace($RepoPath)) { $RepoPath = '/home/git/blog.git' }
if ([string]::IsNullOrWhiteSpace($Branch)) { $Branch = 'main' }
if ([string]::IsNullOrWhiteSpace($KeyPath)) {
  $KeyPath = Join-Path $env:USERPROFILE '.ssh\boke_aliyun_ed25519'
}

$KeyPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($KeyPath)
$GitKeyPath = $KeyPath -replace '\\', '/'
$publicKeyPath = "$KeyPath.pub"

function Invoke-Checked {
  param(
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$WorkingDirectory = $root
  )

  Push-Location -LiteralPath $WorkingDirectory
  try {
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "$FilePath failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

function Quote-Sh {
  param([string]$Value)
  return "'" + ($Value -replace "'", "'\''") + "'"
}

function Show-SshHelp {
  Write-Host ''
  Write-Host 'SSH access is not ready yet.'
  Write-Host 'Run this on the Aliyun ECS as root, or paste it into Workbench:'
  Write-Host ''
  $publicKey = ''
  if (Test-Path -LiteralPath $publicKeyPath) {
    $publicKey = (Get-Content -LiteralPath $publicKeyPath -Raw).Trim()
  }
  Write-Host ("BOKE_PUBLIC_KEY='" + $publicKey + "' bash /opt/boke/aliyun-bootstrap-blog.sh")
  Write-Host ''
  Write-Host 'If the bootstrap script has not been uploaded yet, upload deploy/aliyun-bootstrap-blog.sh to /opt/boke/ first.'
}

if (-not (Test-Path -LiteralPath $KeyPath)) {
  Invoke-Checked 'powershell.exe' @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', (Join-Path $root 'tools\prepare-aliyun-ssh.ps1')
  )
}

$configText = Get-Content -LiteralPath (Join-Path $root '_config.yml') -Raw
if ($configText -notmatch '(?m)^root:\s*/boke/\s*$') {
  throw 'Expected _config.yml to keep root: /boke/. Refusing to deploy with a different root.'
}

$remoteCheck = 'test -d ' + (Quote-Sh $RepoPath) + ' && echo READY'
$sshArgs = @(
  '-i', $KeyPath,
  '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=8',
  '-o', 'StrictHostKeyChecking=accept-new',
  "$SshUser@$ServerHost",
  $remoteCheck
)

& ssh.exe @sshArgs
if ($LASTEXITCODE -ne 0) {
  Show-SshHelp
  throw "Cannot access ${SshUser}@${ServerHost}:${RepoPath}"
}

if ($CheckOnly) {
  Write-Host "SSH and remote repository are ready: ${SshUser}@${ServerHost}:${RepoPath}"
  exit 0
}

if (-not $SkipBuild) {
  Invoke-Checked 'npm.cmd' @('run', 'clean')
  Invoke-Checked 'npm.cmd' @('run', 'build')
}

$publicDir = Join-Path $root 'public'
if (-not (Test-Path -LiteralPath (Join-Path $publicDir 'index.html'))) {
  throw 'public/index.html was not found. Run npm run build first.'
}

$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$deployDir = Join-Path $env:TEMP "boke-aliyun-deploy-$stamp"
$siteDir = Join-Path $deployDir 'boke'

New-Item -ItemType Directory -Force -Path $siteDir | Out-Null
Get-ChildItem -LiteralPath $publicDir | Copy-Item -Destination $siteDir -Recurse -Force

try {
  Invoke-Checked 'git.exe' @('init') $deployDir
  Invoke-Checked 'git.exe' @('checkout', '-B', $Branch) $deployDir
  Invoke-Checked 'git.exe' @('config', 'user.name', 'boke deploy') $deployDir
  Invoke-Checked 'git.exe' @('config', 'user.email', 'boke-deploy@local') $deployDir
  Invoke-Checked 'git.exe' @('config', 'core.autocrlf', 'false') $deployDir
  Invoke-Checked 'git.exe' @('config', 'core.sshCommand', "ssh -i $GitKeyPath -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new") $deployDir
  Invoke-Checked 'git.exe' @('add', 'boke') $deployDir
  Invoke-Checked 'git.exe' @('commit', '-m', "deploy boke $stamp") $deployDir

  $remote = "${SshUser}@${ServerHost}:${RepoPath}"
  Invoke-Checked 'git.exe' @('remote', 'add', 'aliyun', $remote) $deployDir
  Invoke-Checked 'git.exe' @('push', '--force', 'aliyun', "${Branch}:${Branch}") $deployDir
} finally {
  Remove-Item -LiteralPath $deployDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Aliyun deploy finished: http://$ServerHost/boke/"
