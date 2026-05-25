$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root

npm run build
git add .

$changes = git status --porcelain
if (-not $changes) {
  Write-Host '没有需要发布的新内容。'
  exit 0
}

$message = "update blog $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
git commit -m $message
git push

Write-Host '发布完成，稍等一会儿访问：'
Write-Host 'https://wfcrush.github.io/boke/'
Write-Host '如果刚发布后还没看到，请等待 GitHub Pages 自动部署完成，通常需要 30 到 90 秒。'
