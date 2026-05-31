$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location -LiteralPath $root

function Open-CommandWindow {
  param(
    [string]$Title,
    [string]$Command
  )

  $safeRoot = $root.Path.Replace("'", "''")
  $script = "Set-Location -LiteralPath '$safeRoot'; `$Host.UI.RawUI.WindowTitle = '$Title'; $Command"
  Start-Process powershell.exe -ArgumentList @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-NoExit',
    '-Command', $script
  )
}

function Wait-And-Open {
  param(
    [string]$Url,
    [int]$Seconds = 1
  )

  Start-Sleep -Seconds $Seconds
  Start-Process $Url
}

function Show-Menu {
  Clear-Host
  Write-Host ''
  Write-Host '========================================'
  Write-Host '              Blog Workbench'
  Write-Host '========================================'
  Write-Host ''
  Write-Host '  1. 写文章/改文章：打开后台 + 本地预览'
  Write-Host '  2. 只打开博客后台'
  Write-Host '  3. 只打开本地预览'
  Write-Host '  4. 发布上线'
  Write-Host '  5. 打开文章文件夹'
  Write-Host '  6. 打开线上博客'
  Write-Host '  7. 安装或修复依赖'
  Write-Host '  0. 退出'
  Write-Host ''
  Write-Host '========================================'
  Write-Host ''
}

function Back-To-Menu {
  Write-Host ''
  Read-Host '完成。按回车返回菜单'
}

while ($true) {
  Show-Menu
  $choice = Read-Host '请输入数字'

  switch ($choice) {
    '1' {
      Write-Host '正在打开后台和本地预览...'
      Open-CommandWindow -Title 'Blog Admin' -Command 'npm run admin'
      Wait-And-Open -Url 'http://127.0.0.1:5050/' -Seconds 3
      Open-CommandWindow -Title 'Blog Preview' -Command 'npm run server'
      Wait-And-Open -Url 'http://localhost:4000/boke/' -Seconds 4
      Back-To-Menu
    }
    '2' {
      Write-Host '正在打开博客后台...'
      Open-CommandWindow -Title 'Blog Admin' -Command 'npm run admin'
      Wait-And-Open -Url 'http://127.0.0.1:5050/' -Seconds 3
      Back-To-Menu
    }
    '3' {
      Write-Host '正在打开本地预览...'
      Open-CommandWindow -Title 'Blog Preview' -Command 'npm run server'
      Wait-And-Open -Url 'http://localhost:4000/boke/' -Seconds 4
      Back-To-Menu
    }
    '4' {
      Clear-Host
      Write-Host ''
      Write-Host '========================================'
      Write-Host '              Publish Online'
      Write-Host '========================================'
      Write-Host ''
      Write-Host '发布前请确认：'
      Write-Host '1. 文章已经保存。'
      Write-Host '2. 本地预览看起来没问题。'
      Write-Host '3. 网络或代理可用。'
      Write-Host ''
      $confirm = Read-Host '输入 y 确认发布，其他任意键取消'
      if ($confirm -eq 'y' -or $confirm -eq 'Y') {
        npm run publish
      }
      Back-To-Menu
    }
    '5' {
      Start-Process (Join-Path $root 'source\_posts')
      Back-To-Menu
    }
    '6' {
      Start-Process 'https://wfcrush.github.io/boke/'
      Start-Process 'http://wf.5yu.org/'
      Back-To-Menu
    }
    '7' {
      npm install
      Back-To-Menu
    }
    '0' {
      break
    }
    default {
      Write-Host '请输入 0 到 7 之间的数字。'
      Start-Sleep -Seconds 1
    }
  }
}
