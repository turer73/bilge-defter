$ErrorActionPreference='Stop'
$account='943daf7a8f4acddbe3ae39583596707d'
$base="https://api.cloudflare.com/client/v4/accounts/$account"
$headers=@{Authorization=('Bearer '+[IO.File]::ReadAllText('C:\Users\sevdi\Desktop\cloude (2).txt').Trim())}
function Api($method,$url,$body=$null) {
  $params=@{Method=$method;Uri=$url;Headers=$headers;TimeoutSec=30}
  if($null -ne $body){$params.ContentType='application/json';$params.Body=ConvertTo-Json $body -Depth 20 -Compress}
  try {$r=Invoke-RestMethod @params} catch {throw "Cloudflare request failed: $method $url status $([int]$_.Exception.Response.StatusCode)"}
  if(!$r.success){throw "Cloudflare request unsuccessful: $method $url"};return $r.result
}
if(Test-Path "$PSScriptRoot/invited-resources.json"){throw 'State already exists; inspect instead of recreating'}
$zone=@(Api GET 'https://api.cloudflare.com/client/v4/zones?name=bilgearena.com')
if($zone.Count -ne 1 -or $zone[0].account.id -ne $account){throw 'Zone mismatch'}
$dnsBase="https://api.cloudflare.com/client/v4/zones/$($zone[0].id)/dns_records"
$dns=@(Api GET ($dnsBase+'?per_page=5000'))
if($dns | Where-Object name -eq 'defter.bilgearena.com'){throw 'DNS already exists'}
$apps=@(Api GET "$base/access/apps")
if($apps | Where-Object domain -like '*defter.bilgearena.com*'){throw 'Access app already exists'}
$tunnels=@(Api GET "$base/cfd_tunnel?is_deleted=false")
if($tunnels | Where-Object name -eq 'bilge-defter-invited'){throw 'Tunnel already exists'}
$existing=Api GET "$base/access/apps/b7210cec-ce10-47fa-ae04-0c5f401d9329"
$existingPolicies=@(Api GET "$base/access/apps/b7210cec-ce10-47fa-ae04-0c5f401d9329/policies")
if($existingPolicies.Count -ne 1 -or $existingPolicies[0].decision -ne 'non_identity'){throw 'Existing app authentication differs'}
$existingTunnel=Api GET "$base/cfd_tunnel/bc820d66-87d2-4fff-893b-6b61155165b1/configurations"
$baseline=@{dns=$dns;app=$existing;policies=$existingPolicies;tunnel=$existingTunnel}
$baseline | ConvertTo-Json -Depth 40 | Set-Content "$PSScriptRoot/invited-baseline.json" -Encoding utf8
$state=@{account=$account;zone=$zone[0].id;hostname='defter.bilgearena.com'}
function Save-State { $state | ConvertTo-Json -Depth 10 | Set-Content "$PSScriptRoot/invited-resources.json" -Encoding utf8 }
$providers=@(Api GET "$base/access/identity_providers")
$otp=@($providers | Where-Object type -eq 'onetimepin')
if($otp.Count -gt 1){throw 'Ambiguous OTP providers'}
if($otp.Count -eq 0){$provider=Api POST "$base/access/identity_providers" @{name='Bilge Defter email PIN';type='onetimepin';config=@{}};$state.created_idp=$true}else{$provider=$otp[0];$state.created_idp=$false}
$state.idp=$provider.id;Save-State
$app=Api POST "$base/access/apps" @{name='Bilge Defter - Davetli';domain=$state.hostname;type='self_hosted';session_duration='24h';allowed_idps=@($provider.id);auto_redirect_to_identity=$true;app_launcher_visible=$false;allow_authenticate_via_warp=$false;http_only_cookie_attribute=$true;same_site_cookie_attribute='lax';policies=@(@{name='Yalniz iki davetli e-posta';decision='allow';precedence=1;include=@(@{email=@{email='turgut.urer@gmail.com'}},@{email=@{email='sevdilurer@gmail.com'}});exclude=@();require=@()})}
$state.app=$app.id;$state.aud=$app.aud;Save-State
$policies=@(Api GET "$base/access/apps/$($app.id)/policies")
$emails=@($policies[0].include | ForEach-Object {$_.email.email} | Sort-Object)
if($policies.Count -ne 1 -or $policies[0].decision -ne 'allow' -or ($emails -join ',') -ne 'sevdilurer@gmail.com,turgut.urer@gmail.com' -or $policies[0].include.Count -ne 2){throw 'Policy verification failed'}
$state.policy=$policies[0].id;Save-State
$tunnel=Api POST "$base/cfd_tunnel" @{name='bilge-defter-invited';config_src='cloudflare'}
$state.tunnel=$tunnel.id;Save-State
$config=@{config=@{ingress=@(@{hostname=$state.hostname;service='http://127.0.0.1:18790';originRequest=@{access=@{required=$true;teamName='noisy-butterfly-321d';audTag=@($app.aud)}}},@{service='http_status:404'})}}
$configured=Api PUT "$base/cfd_tunnel/$($tunnel.id)/configurations" $config
$state.config_version=$configured.version;Save-State
@{app=$state.app;policy=$state.policy;idp=$state.idp;tunnel=$state.tunnel;allowlist=$emails;dns_published=$false} | ConvertTo-Json
