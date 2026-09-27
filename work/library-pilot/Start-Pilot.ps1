$ErrorActionPreference='Stop'
$taskPython=Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
if(-not (Test-Path -LiteralPath $taskPython)){throw 'Python çalışma ortamı bulunamadı. Python 3 + pypdf ve Poppler pdftoppm gerekir; otomatik kurulum yapılmaz.'}
$taskPoppler=Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin'
$env:PATH="$taskPoppler;$env:PATH"
Write-Host 'Pilot adresi: http://127.0.0.1:8766 - yalnız bu bilgisayar. Durdurmak için Ctrl+C.'
& $taskPython (Join-Path $PSScriptRoot 'server.py')
