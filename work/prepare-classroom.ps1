param([switch]$Upload)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$candidate=Join-Path $root 'server-candidate/v49'
$bundle=Join-Path $PSScriptRoot 'bilge-defter-classroom-v49.tar.gz'
$ui=Join-Path $PSScriptRoot 'bilge-defter-invited-v49'
if(!(Test-Path "$ui/SHA256SUMS")){throw 'Build the invited package first'}
# Deliberate allowlist: no env, secrets, virtualenv, unrelated repo or browser harness.
tar -czf $bundle -C $candidate app Dockerfile requirements.txt .dockerignore tests/test_accounts_cas.py tests/test_edge.py tests/test_runtime.py tests/conftest.py
if($LASTEXITCODE -ne 0){throw 'Backend archive failed'}
tar -czf "$PSScriptRoot/bilge-defter-classroom-ui-v49.tar.gz" -C $ui .
if($LASTEXITCODE -ne 0){throw 'UI archive failed'}
Get-FileHash $bundle,"$PSScriptRoot/bilge-defter-classroom-ui-v49.tar.gz" -Algorithm SHA256 | Select-Object Hash,Path
if($Upload){
  $remote='klipperos@100.84.251.49'
  ssh -i C:/Users/sevdi/.ssh/klipperos_key -o BatchMode=yes $remote 'test ! -e /opt/bilge-defter-classroom-v49 && sudo -n install -d -m 0755 -o klipperos -g klipperos /opt/bilge-defter-classroom-v49'
  if($LASTEXITCODE -ne 0){throw 'Remote stage exists or cannot be created; inspect it before continuing'}
  scp -i C:/Users/sevdi/.ssh/klipperos_key $bundle "$PSScriptRoot/bilge-defter-classroom-ui-v49.tar.gz" "$PSScriptRoot/classroom-nginx.conf" "${remote}:/opt/bilge-defter-classroom-v49/"
  if($LASTEXITCODE -ne 0){throw 'Stage upload failed'}
}
