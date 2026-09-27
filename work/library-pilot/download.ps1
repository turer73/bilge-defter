param([string]$Url, [string]$Target, [long]$Limit)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$allowed=@('lmu.pressbooks.pub','openbooks.lib.msu.edu','rotel.pressbooks.pub','iastate.pressbooks.pub','wtcs.pressbooks.pub')
$uri=[uri]$Url
if($uri.Scheme -ne 'https' -or $uri.Host -notin $allowed -or $uri.Port -ne 443 -or $uri.UserInfo){throw 'Publisher not approved'}
$head=Invoke-WebRequest -Method Head -Uri $Url -MaximumRedirection 0 -TimeoutSec 30
if($head.Headers['Content-Length'] -and [long]($head.Headers['Content-Length'] | Select-Object -First 1) -gt $Limit){throw 'Download budget exceeded'}
# No redirects, cookies from accounts, credentials or access-control workarounds.
$response=Invoke-WebRequest -Uri $Url -OutFile $Target -PassThru -MaximumRedirection 0 -TimeoutSec 300
$size=(Get-Item -LiteralPath $Target).Length
if($size -gt $Limit){throw 'Downloaded file exceeds budget'}
@{url=$Url;bytes=$size;content_type=($response.Headers['Content-Type'] | Select-Object -First 1);etag=($response.Headers['ETag'] | Select-Object -First 1)} | ConvertTo-Json -Compress
