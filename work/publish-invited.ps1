$ErrorActionPreference='Stop'
$s=Get-Content -Raw "$PSScriptRoot/invited-resources.json" | ConvertFrom-Json
$baseline=Get-Content -Raw "$PSScriptRoot/invited-baseline.json" | ConvertFrom-Json
$base="https://api.cloudflare.com/client/v4/accounts/$($s.account)"
# Cloudflare account token: only from the environment, never from a file path in this repository.
$cfToken=$env:CLOUDFLARE_API_TOKEN
if([string]::IsNullOrWhiteSpace($cfToken)){throw 'CLOUDFLARE_API_TOKEN ortam degiskeni bos. Anahtari User ortam degiskeni olarak tanimlayin; dosyada tutmayin.'}
$headers=@{Authorization=('Bearer '+$cfToken.Trim())}
function Api($method,$url,$body=$null){
 $p=@{Method=$method;Uri=$url;Headers=$headers;TimeoutSec=30}
 if($null -ne $body){$p.ContentType='application/json';$p.Body=ConvertTo-Json $body -Depth 20 -Compress}
 try{$r=Invoke-RestMethod @p}catch{throw "API failed: $method $url status $([int]$_.Exception.Response.StatusCode)"}
 if(!$r.success){throw 'API unsuccessful'};return $r.result
}
function Same($x,$y){(ConvertTo-Json $x -Depth 40 -Compress) -ceq (ConvertTo-Json $y -Depth 40 -Compress)}
$app=Api GET "$base/access/apps/$($s.app)"
if($app.domain -ne $s.hostname -or $app.type -ne 'self_hosted' -or $app.allowed_idps.Count -ne 1 -or $app.allowed_idps[0] -ne $s.idp -or $app.aud -ne $s.aud){throw 'App mismatch'}
$policies=@(Api GET "$base/access/apps/$($s.app)/policies")
$p=$policies[0];$emails=@($p.include | ForEach-Object {$_.email.email} | Sort-Object)
if($policies.Count -ne 1 -or $p.decision -ne 'allow' -or $p.include.Count -ne 2 -or ($emails -join ',') -ne 'sevdilurer@gmail.com,turgut.urer@gmail.com' -or $p.exclude.Count -ne 0 -or $p.require.Count -ne 0){throw 'Policy mismatch'}
$config=(Api GET "$base/cfd_tunnel/$($s.tunnel)/configurations").config
$i=$config.ingress
if($i.Count -ne 2 -or $i[0].hostname -ne $s.hostname -or $i[0].service -ne 'http://127.0.0.1:18790' -or !$i[0].originRequest.access.required -or $i[0].originRequest.access.teamName -ne 'noisy-butterfly-321d' -or $i[0].originRequest.access.audTag[0] -ne $s.aud -or $i[1].service -ne 'http_status:404'){throw 'Tunnel mismatch'}
$tunnel=Api GET "$base/cfd_tunnel/$($s.tunnel)"
if($tunnel.status -ne 'healthy'){throw "Tunnel not healthy: $($tunnel.status)"}
if(!(Same (Api GET "$base/access/apps/b7210cec-ce10-47fa-ae04-0c5f401d9329") $baseline.app)){throw 'Existing app changed'}
if(!(Same @(Api GET "$base/access/apps/b7210cec-ce10-47fa-ae04-0c5f401d9329/policies") @($baseline.policies))){throw 'Existing policies changed'}
if(!(Same (Api GET "$base/cfd_tunnel/bc820d66-87d2-4fff-893b-6b61155165b1/configurations") $baseline.tunnel)){throw 'Existing tunnel changed'}
$dnsBase="https://api.cloudflare.com/client/v4/zones/$($s.zone)/dns_records"
$dns=@(Api GET ($dnsBase+'?per_page=5000'))
if(!(Same @($dns | Sort-Object id) @($baseline.dns | Sort-Object id))){throw 'DNS baseline changed'}
if($dns | Where-Object name -eq $s.hostname){throw 'DNS already exists'}
$record=Api POST $dnsBase @{type='CNAME';name=$s.hostname;content="$($s.tunnel).cfargotunnel.com";proxied=$true;ttl=1;comment='Bilge Defter invited-only pilot; dedicated Access + Tunnel'}
$s | Add-Member -NotePropertyName dns -NotePropertyValue $record.id
$s | ConvertTo-Json -Depth 10 | Set-Content "$PSScriptRoot/invited-resources.json" -Encoding utf8
$after=@(Api GET ($dnsBase+'?per_page=5000'))
if(!(Same @($after | Where-Object id -ne $record.id | Sort-Object id) @($baseline.dns | Sort-Object id))){throw 'Unexpected DNS change'}
@{hostname=$record.name;dns=$record.id;tunnel_status=$tunnel.status;existing_app_unchanged=$true;existing_tunnel_unchanged=$true;existing_dns_unchanged=$true;allowlist=$emails} | ConvertTo-Json
