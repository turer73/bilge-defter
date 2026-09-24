param([switch]$Create)
$ErrorActionPreference='Stop'
$account='943daf7a8f4acddbe3ae39583596707d'
$base="https://api.cloudflare.com/client/v4/accounts/$account"
$name='bilge-defter-classroom-v49'
$headers=@{Authorization=('Bearer '+[IO.File]::ReadAllText('C:\Users\sevdi\Desktop\cloude (2).txt').Trim())}
function Api($method,$route,$body=$null){
  $options=@{Method=$method;Uri="$base/$route";Headers=$headers;TimeoutSec=25}
  if($null -ne $body){$options.ContentType='application/json';$options.Body=$body|ConvertTo-Json -Depth 12 -Compress}
  try{$response=Invoke-RestMethod @options}catch{throw "Cloudflare operation failed; HTTP $([int]$_.Exception.Response.StatusCode). No credential output."}
  if(!$response.success){throw 'Cloudflare operation not successful'}
  return $response.result
}
$existing=@(Api GET 'tokens'|Where-Object name -eq $name)
if($existing.Count){throw 'Dedicated token already exists. Inspect its custody before retrying; do not create duplicates.'}
$groups=@(Api GET 'tokens/permission_groups')
$names=@('Access: Apps Read','Access: Policies Write','Access: Audit Logs Read','Billing Read')
$chosen=@($groups|Where-Object {$_.name -in $names -and $_.scopes -contains 'com.cloudflare.api.account'})
if($chosen.Count -ne 4){throw 'Expected minimal permission groups not found'}
if(!$Create){@{ready=$true;action='preview-only';permissions=$chosen.name;account=$account;expiry_days=365}|ConvertTo-Json;exit 0}
# Explicit -Create is used only after user approves a separate service credential.
$remote='klipperos@100.84.251.49'
ssh -i C:/Users/sevdi/.ssh/klipperos_key -o BatchMode=yes $remote 'sudo -n test -d /opt/bilge-defter-classroom-v49/secrets && sudo -n test ! -e /opt/bilge-defter-classroom-v49/secrets/cloudflare-token'
if($LASTEXITCODE -ne 0){throw 'Secret target is not ready or already occupied'}
$expires=(Get-Date).ToUniversalTime().AddDays(365).ToString('yyyy-MM-ddTHH:mm:ssZ')
$body=@{name=$name;expires_on=$expires;policies=@(@{effect='allow';resources=@{"com.cloudflare.api.account.$account"='*'};permission_groups=@($chosen|ForEach-Object {@{id=$_.id}})})}
$created=Api POST 'tokens' $body
if(!$created.value){throw 'Token was created but no value returned. Inspect Cloudflare before retry.'}
# Secret travels only on encrypted SSH standard input; not command line, repo or logs.
$created.value | ssh -i C:/Users/sevdi/.ssh/klipperos_key -o BatchMode=yes $remote 'sudo -n sh -c "umask 077; set -C; cat > /opt/bilge-defter-classroom-v49/secrets/cloudflare-token" && sudo -n chown +10001:+10001 /opt/bilge-defter-classroom-v49/secrets/cloudflare-token'
if($LASTEXITCODE -ne 0){throw "Token created but server storage failed. Token ID $($created.id); inspect/revoke before retry."}
@{created=$true;id=$created.id;name=$name;expires_on=$expires;permissions=$chosen.name;secret_printed=$false}|ConvertTo-Json
$created=$null
