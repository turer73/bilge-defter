"""Narrow web-only deployment with live-state guards and retained v52 rollback.
Run on Klipper: stage, activate, rollback, or status. No database/env access.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

STAGE = Path('/opt/bilge-defter-classroom-v54')
PRIOR = Path('/opt/bilge-defter-classroom-v52/ui')
CURRENT = Path('/opt/bilge-defter-invited/current')
WEB = 'bilge-defter-invited-web'
PREVIEW = 'bilge-defter-web-preview-v54'
ROLLBACK = 'bilge-defter-invited-web-rollback-v54'
FAILED_FIRST = 'bilge-defter-invited-web-failed-v54'
FAILED = 'bilge-defter-invited-web-failed-v54-retry'
OLD_ID = 'fb0defd5cae5e6bf99413cc886e931efbed93d2a9efc8b0d73bd610f44255955'
IMAGE = 'sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236'

def cmd(*args):
    return subprocess.check_output(args, text=True, timeout=90).strip()

def inspect(name):
    # Select only non-secret fields; never print the full Docker configuration.
    p = subprocess.run(['docker','inspect',name],capture_output=True,text=True,timeout=20)
    if p.returncode:
        if 'no such object:' in p.stderr.lower() or 'no such container:' in p.stderr.lower(): return None
        raise RuntimeError('Docker inspect failed')
    value = json.loads(p.stdout)[0]
    return {'id':value['Id'],'name':value['Name'].lstrip('/'),'image':value['Image'],
            'started':value['State']['StartedAt'],'status':value['State']['Status']}

def other_state():
    excluded = {WEB,PREVIEW,ROLLBACK,FAILED,FAILED_FIRST}
    rows = [inspect(i) for i in cmd('docker','ps','-aq').split()]
    return sorted([r for r in rows if r['name'] not in excluded],key=lambda r:r['name'])

def package():
    assert STAGE.resolve() == STAGE and not STAGE.is_symlink()
    receipt = json.loads((STAGE/'build-receipt.json').read_text())
    assert receipt['version']=='v54' and receipt['pdfFeatureAdded'] is False
    for file,key in [('ui/SHA256SUMS','packageHash'),('classroom-nginx.conf','configHash')]:
        assert hashlib.sha256((STAGE/file).read_bytes()).hexdigest()==receipt[key],file
    for line in (STAGE/'ui/SHA256SUMS').read_text().splitlines():
        digest,name=line.split(maxsplit=1)
        assert '..' not in Path(name).parts and not Path(name).is_absolute()
        assert hashlib.sha256((STAGE/'ui'/name).read_bytes()).hexdigest()==digest,name

def old():
    assert inspect(WEB)['id']==OLD_ID and inspect(WEB)['status']=='running'
    assert CURRENT.is_symlink() and CURRENT.resolve()==PRIOR
    assert hashlib.sha256((PRIOR/'SHA256SUMS').read_bytes()).hexdigest()=='ac4216857e0fa5a04c31e6d10394c28d68cb87e594b40870a6fbb67582b956f9'
    assert hashlib.sha256((PRIOR.parent/'classroom-nginx.conf').read_bytes()).hexdigest()=='505cd65af68387806b9a70121117e2bd71183e81d2952b403d5de58cbe55771a'

def unchanged():
    snapshot=json.loads((STAGE/'before.json').read_text())
    assert other_state()==snapshot['otherContainers'],'Unrelated container state changed'
    assert cmd('systemctl','show','linux-ai-server','-p','MainPID','--value')==snapshot['linuxAiPid']

def web(name,port):
    assert inspect(name) is None, 'Target container already exists'
    cmd('docker','run','-d','--name',name,'--restart','unless-stopped','--network','bilge-defter-classroom',
        '--read-only','--memory','128m','--cpus','0.5','--pids-limit','100',
        '--tmpfs','/var/cache/nginx:rw,noexec,nosuid,size=16m','--tmpfs','/var/run:rw,noexec,nosuid,size=1m',
        '--cap-drop','ALL','--cap-add','CHOWN','--cap-add','SETGID','--cap-add','SETUID',
        '--security-opt','no-new-privileges:true','-p',f'127.0.0.1:{port}:80',
        '-v',str(STAGE/'ui')+':/usr/share/nginx/html:ro',
        '-v',str(STAGE/'classroom-nginx.conf')+':/etc/nginx/conf.d/default.conf:ro',IMAGE)
    for _ in range(20):
        p=subprocess.run(['docker','exec',name,'nginx','-t'],capture_output=True,text=True,timeout=10)
        if p.returncode==0:return
        time.sleep(.25)
    raise RuntimeError('nginx did not become ready')

def verify(port):
    return json.loads(cmd('python3',str(STAGE/'verify-publication-v54.py'),str(STAGE/'ui'),str(port)))

def point(target):
    assert CURRENT.is_symlink() and CURRENT.resolve() in {PRIOR,STAGE/'ui'}
    assert target in {PRIOR,STAGE/'ui'}
    if CURRENT.resolve()==target:return
    temp=CURRENT.parent/'.current-v54'
    assert not temp.exists() and not temp.is_symlink()
    cmd('sudo','-n','ln','-s',str(target),str(temp))
    cmd('sudo','-n','mv','-T',str(temp),str(CURRENT))
    assert CURRENT.resolve()==target

def rollback():
    previous=inspect(ROLLBACK)
    assert previous and previous['id']==OLD_ID
    active=inspect(WEB)
    if active:
        assert active['image']==IMAGE and not inspect(FAILED)
        # Only a web created with this release's exact bind mount is eligible.
        mounts=json.loads(cmd('docker','inspect',WEB,'--format','{{json .Mounts}}'))
        assert any(m['Source']==str(STAGE/'ui') and m['Destination']=='/usr/share/nginx/html' for m in mounts)
        cmd('docker','stop',WEB);cmd('docker','rename',WEB,FAILED)
    cmd('docker','rename',ROLLBACK,WEB);cmd('docker','start',WEB);point(PRIOR)
    assert inspect(WEB)['id']==OLD_ID

def main():
    mode=sys.argv[1] if len(sys.argv)>1 else 'status'
    if mode=='status':
        print(json.dumps({'web':inspect(WEB),'current':str(CURRENT.resolve()),'rollback':inspect(ROLLBACK)}));return
    if mode=='rollback':
        unchanged();rollback();unchanged();print('v52 restored; v54 failed container retained');return
    package();old()
    if mode=='stage':
        if (STAGE/'before.json').exists():
            # Resume only a failed pre-creation check; retain the original snapshot.
            assert inspect(PREVIEW) is None and not (STAGE/'preview-receipt.json').exists()
            unchanged()
        else:
            snapshot={'otherContainers':other_state(),'linuxAiPid':cmd('systemctl','show','linux-ai-server','-p','MainPID','--value'),'oldWeb':inspect(WEB)}
            (STAGE/'before.json').write_text(json.dumps(snapshot,indent=2))
        web(PREVIEW,18795);receipt=verify(18795);old();unchanged()
        (STAGE/'preview-receipt.json').write_text(json.dumps(receipt,indent=2));print(json.dumps(receipt));return
    assert mode=='activate'
    cmd('sudo','-n','test','-w',str(CURRENT.parent))
    unchanged();verify(18795);assert not inspect(ROLLBACK) and not inspect(FAILED)
    # Recheck starting state immediately before replacing the one authorized container.
    old();package()
    try:
        cmd('docker','stop',WEB);cmd('docker','rename',WEB,ROLLBACK)
        web(WEB,18790);receipt=verify(18790);unchanged();point(STAGE/'ui')
    except BaseException:
        if inspect(ROLLBACK):rollback()
        elif inspect(WEB) and inspect(WEB)['id']==OLD_ID:cmd('docker','start',WEB)
        raise
    (STAGE/'origin-receipt.json').write_text(json.dumps(receipt,indent=2))
    cmd('docker','stop',PREVIEW);unchanged()
    print(json.dumps({'active':'v54','rollback':'v52','receipt':receipt,'otherContainersUnchanged':True}))

if __name__=='__main__':main()
