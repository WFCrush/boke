param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Title
)

Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
npx hexo-cli new $Title
