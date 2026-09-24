$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$out=Join-Path $repo 'outputs/v50-release'
New-Item -ItemType Directory -Path $out -Force | Out-Null
$source=Join-Path $repo 'server-candidate/v49'
$files=@('Dockerfile','.dockerignore','requirements.txt','tests/conftest.py','tests/test_accounts_cas.py','tests/test_edge.py','tests/test_runtime.py','tests/test_ocr_limits.py')
$files+=Get-ChildItem -LiteralPath (Join-Path $source 'app') -Recurse -File -Filter '*.py' | ForEach-Object { [IO.Path]::GetRelativePath($source,$_.FullName).Replace('\','/') }
$lines=$files | Sort-Object | ForEach-Object { (Get-FileHash -LiteralPath (Join-Path $source $_)).Hash.ToLowerInvariant()+'  '+$_ }
[IO.File]::WriteAllText((Join-Path $out 'SOURCE_SHA256SUMS'),($lines -join "`n")+"`n",[Text.UTF8Encoding]::new($false))
& tar -czf (Join-Path $out 'backend-v50.tar.gz') -C $source @files -C $out SOURCE_SHA256SUMS
if($LASTEXITCODE -ne 0){throw 'Backend packaging failed'}
& tar -czf (Join-Path $out 'ui-v50.tar.gz') -C (Join-Path $repo 'work/bilge-defter-invited-v50') .
if($LASTEXITCODE -ne 0){throw 'UI packaging failed'}
$receipt=@{version='v50';gitHead=(& git -C $repo rev-parse HEAD);provenance='Existing dirty working tree; allowlisted source archive, not a clean-clone build';sourceFiles=$files.Count;uiManifestSHA256=(Get-FileHash (Join-Path $repo 'work/bilge-defter-invited-v50/SHA256SUMS')).Hash.ToLowerInvariant();artifacts=@{}}
foreach($name in @('backend-v50.tar.gz','ui-v50.tar.gz','SOURCE_SHA256SUMS')){$receipt.artifacts[$name]=(Get-FileHash (Join-Path $out $name)).Hash.ToLowerInvariant()}
[IO.File]::WriteAllText((Join-Path $out 'package-receipt.json'),($receipt|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
$receipt | ConvertTo-Json -Depth 5
