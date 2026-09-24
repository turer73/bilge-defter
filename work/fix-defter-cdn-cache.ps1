$ErrorActionPreference='Stop'
$s=Get-Content -Raw "$PSScriptRoot/invited-resources.json" | ConvertFrom-Json
$h=@{Authorization=('Bearer '+[IO.File]::ReadAllText('C:\Users\sevdi\Desktop\cloude (2).txt').Trim())}
$zone="https://api.cloudflare.com/client/v4/zones/$($s.zone)"
function Api($method,$url,$body=$null){$p=@{Method=$method;Uri=$url;Headers=$h;TimeoutSec=30};if($null -ne $body){$p.ContentType='application/json';$p.Body=ConvertTo-Json $body -Depth 20 -Compress};try{$r=Invoke-RestMethod @p}catch{throw "Cloudflare $method failed; HTTP $([int]$_.Exception.Response.StatusCode)"};if(!$r.success){throw 'Cloudflare operation failed'};return $r.result}
$before=Api GET "$zone/rulesets/phases/http_request_cache_settings/entrypoint"
if($before.id -ne '200c5ef5642f4db9a36ecc1f653664e5' -or $before.version -ne '5' -or $before.rules.Count -ne 3){throw 'Cache rules changed; inspect before retrying'}
if($before.rules[-1].id -ne '988887f009f74178b46f34ceb28f2b3c' -or $before.rules[-1].action_parameters.edge_ttl.default -ne 7200){throw 'Unexpected baseline'}
$before | ConvertTo-Json -Depth 30 | Set-Content "$PSScriptRoot/defter-cache-before.json" -Encoding utf8
$body=@{description='Bilge Defter PWA - bypass edge cache for invited hostname only';expression='(http.host eq "defter.bilgearena.com")';action='set_cache_settings';action_parameters=@{cache=$false};enabled=$true;position=@{after=''}}
$null=Api POST "$zone/rulesets/$($before.id)/rules" $body
$after=Api GET "$zone/rulesets/$($before.id)"
if($after.rules.Count -ne 4){throw 'Unexpected rule count'}
for($i=0;$i -lt 3;$i++){if((ConvertTo-Json $before.rules[$i] -Depth 20 -Compress) -cne (ConvertTo-Json $after.rules[$i] -Depth 20 -Compress)){throw "Original rule changed: $i"}}
$rule=$after.rules[-1]
if($rule.expression -cne $body.expression -or $rule.action_parameters.cache -ne $false -or !$rule.enabled){throw 'New rule verification failed'}
$state=@{zone=$s.zone;ruleset=$after.id;rule=$rule.id;version=$after.version;hostname=$s.hostname;otherRulesUnchanged=$true}
$state | ConvertTo-Json | Set-Content "$PSScriptRoot/defter-cache-fix.json" -Encoding utf8
$paths=@('/','/index.html','/sw.js','/offline-assets.json','/release.json','/pwa.js','/media-workspace.js','/pdf-workspace.js','/ui-workspace.js','/ui.css','/manifest.webmanifest')
$purge=Api POST "$zone/purge_cache" @{files=@($paths | ForEach-Object {'https://defter.bilgearena.com'+$_})}
$state.purgedFiles=$paths.Count;$state.purgeId=$purge.id
$state | ConvertTo-Json | Set-Content "$PSScriptRoot/defter-cache-fix.json" -Encoding utf8
$state | ConvertTo-Json
