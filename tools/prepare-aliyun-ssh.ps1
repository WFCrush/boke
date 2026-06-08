$ErrorActionPreference = 'Stop'

$sshDir = Join-Path $env:USERPROFILE '.ssh'
$keyPath = Join-Path $sshDir 'boke_aliyun_ed25519'
$pubPath = "$keyPath.pub"

New-Item -ItemType Directory -Force -Path $sshDir | Out-Null

if (-not (Test-Path -LiteralPath $keyPath)) {
  $command = 'ssh-keygen.exe -t ed25519 -f "' + $keyPath + '" -N "" -C "boke-aliyun-deploy"'
  & cmd.exe /d /c $command

  if ($LASTEXITCODE -ne 0) {
    throw "ssh-keygen failed with exit code $LASTEXITCODE"
  }
}

if (-not (Test-Path -LiteralPath $pubPath)) {
  & ssh-keygen.exe -y -f $keyPath | Set-Content -LiteralPath $pubPath -Encoding ascii

  if ($LASTEXITCODE -ne 0) {
    throw "Failed to derive public key from $keyPath"
  }
}

Write-Host "Private key: $keyPath"
Write-Host "Public key:  $pubPath"
Write-Host ''
Write-Host 'Add this public key to the Aliyun ECS login user authorized_keys:'
Get-Content -LiteralPath $pubPath
