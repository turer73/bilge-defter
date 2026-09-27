"""Run on Klipper only. Stage/activate/rollback the library route, not the v54 app.
No accounts DB, Access policy, secrets, shared application or DNS modifications.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import time
from urllib.request import Request,urlopen
from urllib.error import HTTPError

STAGE=Path('/opt/bilge-defter-library-v1')
WEB='bilge-defter-invited-web'
LIB='bilge-defter-library-v1'
PREVIEW='bilge-defter-library-preview-v1'
CONF=Path('/opt/bilge-defter-classroom-v54/classroom-nginx.conf')
WEBID='37f5d2c0e6b08a84613ab111c89fa67f99aa0820eada92a09e4b6d3dd5373b0d'
OLDHASH='8d3ca55ba9fe6282c114e28c3558b800c4e368833ecf2f0d72ae6a6e1c2a68f1'
APPHASH='be5f789bc33c6d57c443c4c3d77642a31a15c4274212f589e37dfdacbb42b740'
IMAGE='sha256:96eed6dc542afca240700857c633379e7d5992259903026f1f629b7a8df21359'
NGINX='sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236'

def run(*args):return subprocess.check_output(args,text=True,timeout=90).strip()
def digest(path):
    with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def inspect(name):
    p=subprocess.run(['docker','inspect',name],capture_output=True,text=True)
    if p.returncode:return None
    x=json.loads(p.stdout)[0]
    return {'id':x['Id'],'name':x['Name'].lstrip('/'),'image':x['Image'],'started':x['State']['StartedAt'],'status':x['State']['Status']}
def protected():
    values=[inspect(i) for i in run('docker','ps','-aq').split()]
    return {'containers':sorted([x for x in values if x['name'] not in (LIB,PREVIEW)],key=lambda x:x['name']),
            'linux_ai_pid':run('systemctl','show','linux-ai-server','-p','MainPID','--value')}
def guard():
    assert inspect(WEB)['id']==WEBID and inspect(WEB)['status']=='running','Live web changed'
    assert Path('/opt/bilge-defter-invited/current').resolve()==Path('/opt/bilge-defter-classroom-v54/ui')
    assert digest(Path('/opt/bilge-defter-classroom-v54/ui/SHA256SUMS'))==APPHASH
def probe(port,path,headers=None):
    request=Request(f'http://127.0.0.1:{port}'+path,headers={'Host':'defter.bilgearena.com',**(headers or {})})
    try:
        with urlopen(request,timeout=15) as response:return response.status,response.read()
    except HTTPError as exc:return exc.code,exc.read()
def verify(port):
    code,body=probe(port,'/release.json')
    assert code==200 and json.loads(body)=={'version':'v54'}
    for path in ['/library/','/library/api/catalog','/library/api/saved','/library/pdf/msu-neuroscience.pdf','/library/page/msu-neuroscience/14.png']:
        code,body=probe(port,path)
        assert code==401 and 'error' in json.loads(body),(path,code)
    code,body=probe(port,'/library/api/session',{'Cf-Access-Jwt-Assertion':'invalid-test-token'})
    assert code==401 and 'error' in json.loads(body)
    assert probe(port,'/api/v1/bilge-defter/admin/members')[0]==401
    assert probe(port,'/library-no-route')[0]==404
    return {'root_version':'v54','library_unauthenticated':401,'forged_assertion':401,'accounts_unauthenticated':401}

def config():
    original=(STAGE/'before-nginx.conf').read_text()
    addition='''  # Invited source-library pilot v1. Same Access gate, separate approved-account API.
  location = /library { return 302 /library/; }
  location ^~ /library/ {
    limit_req zone=library_requests burst=24 nodelay;
    limit_req_status 429;
    client_max_body_size 2k;
    proxy_pass http://bilge-defter-library-v1:8080/;
    proxy_set_header Host defter.bilgearena.com;
    proxy_set_header Cf-Access-Jwt-Assertion $http_cf_access_jwt_assertion;
    proxy_http_version 1.1;
    proxy_read_timeout 50s;
    proxy_buffering off;
    access_log off;
  }
'''
    assert 'location ^~ /library/' not in original and original.count('  location = / {')==1
    return ('limit_req_zone $http_cf_connecting_ip zone=library_requests:1m rate=8r/s;\n'+original.replace('  location = / {',addition+'  location = / {',1)).encode()

def stage():
    guard();assert digest(CONF)==OLDHASH
    assert inspect(LIB) is None and inspect(PREVIEW) is None
    assert not (STAGE/'before.json').exists(),'Stage already prepared'
    before=protected();(STAGE/'before.json').write_text(json.dumps(before,indent=2))
    (STAGE/'before-nginx.conf').write_bytes(CONF.read_bytes())
    manifest=json.loads((STAGE/'manifest.json').read_text())
    with tarfile.open(STAGE/'bundle.tar') as archive:
        members=archive.getmembers()
        assert set(m.name for m in members)==set(manifest)
        for member in members:
            assert member.isfile() and not Path(member.name).is_absolute() and '..' not in Path(member.name).parts
            with archive.extractfile(member) as f:assert hashlib.file_digest(f,'sha256').hexdigest()==manifest[member.name]
        archive.extractall(STAGE,filter='data')
    for name,sha in manifest.items():assert digest(STAGE/name)==sha
    state=STAGE/'state';state.mkdir();run('sudo','-n','chown','1000:1000',str(state));run('sudo','-n','chmod','700',str(state))
    assert json.loads(run('docker','image','inspect',IMAGE))[0]['Id']==IMAGE
    common=['docker','run','-d','--name',LIB,'--restart','unless-stopped','--network','bilge-defter-classroom','--read-only','--user','1000:1000','--memory','512m','--cpus','0.75','--pids-limit','64','--cap-drop','ALL','--security-opt','no-new-privileges:true','--log-opt','max-size=1m','--log-opt','max-file=2','--tmpfs','/tmp:rw,noexec,nosuid,size=64m,uid=1000,gid=1000','--tmpfs','/cache:rw,noexec,nosuid,size=64m,uid=1000,gid=1000','-v',str(STAGE/'code')+':/srv/library:ro','-v',str(STAGE/'sources')+':/sources:ro','-v',str(state)+':/state:rw','-e','LIBRARY_DATA=/sources','-e','LIBRARY_CACHE=/cache','-e','LIBRARY_STATE=/state','-e','PYTHONDONTWRITEBYTECODE=1','-w','/srv/library','--entrypoint','/usr/bin/python3',IMAGE,'hosted.py']
    run(*common)
    candidate=config();(STAGE/'candidate-nginx.conf').write_bytes(candidate)
    run('docker','run','-d','--name',PREVIEW,'--network','bilge-defter-classroom','--read-only','--memory','128m','--cpus','0.5','--pids-limit','64','--cap-drop','ALL','--cap-add','CHOWN','--cap-add','SETGID','--cap-add','SETUID','--security-opt','no-new-privileges:true','--tmpfs','/var/cache/nginx:rw,noexec,nosuid,size=16m','--tmpfs','/var/run:rw,noexec,nosuid,size=1m','-p','127.0.0.1:18797:80','-v','/opt/bilge-defter-classroom-v54/ui:/usr/share/nginx/html:ro','-v',str(STAGE/'candidate-nginx.conf')+':/etc/nginx/conf.d/default.conf:ro',NGINX)
    for attempt in range(30):
        try:
            evidence=verify(18797);break
        except Exception:
            if attempt==29:raise
            time.sleep(1)
    # Existing image supplies unittest, Python and Poppler; synthetic identities only.
    result=run('docker','exec',LIB,'python3','-m','unittest','-v','test_hosted')
    assert protected()==before,'Unrelated service state changed'
    (STAGE/'stage-proof.json').write_text(json.dumps({'files':len(manifest),'config_sha256':digest(STAGE/'candidate-nginx.conf'),'checks':evidence},indent=2))
    print(json.dumps({'staged':True,'files':len(manifest),'checks':evidence}))

def activate():
    guard();assert digest(CONF)==OLDHASH
    assert protected()==json.loads((STAGE/'before.json').read_text())
    proof=json.loads((STAGE/'stage-proof.json').read_text())
    assert digest(STAGE/'candidate-nginx.conf')==proof['config_sha256']
    verify(18797)
    assert inspect(LIB)['status']=='running'
    try:
        # Keep inode: this config is a Docker single-file bind mount.
        CONF.write_bytes((STAGE/'candidate-nginx.conf').read_bytes())
        run('docker','exec',WEB,'nginx','-t');run('docker','exec',WEB,'nginx','-s','reload')
        for attempt in range(15):
            try:evidence=verify(18790);break
            except Exception:
                if attempt==14:raise
                time.sleep(.5)
        guard();assert protected()==json.loads((STAGE/'before.json').read_text())
        (STAGE/'live-proof.json').write_text(json.dumps({'checks':evidence,'config_sha256':digest(CONF),'unchanged_services':True},indent=2))
        print(json.dumps({'published':True,'checks':evidence}))
    except Exception:
        CONF.write_bytes((STAGE/'before-nginx.conf').read_bytes())
        run('docker','exec',WEB,'nginx','-t');run('docker','exec',WEB,'nginx','-s','reload')
        raise

def rollback():
    guard();assert digest(CONF)==digest(STAGE/'candidate-nginx.conf'),'Config drift; manual review required'
    CONF.write_bytes((STAGE/'before-nginx.conf').read_bytes())
    run('docker','exec',WEB,'nginx','-t');run('docker','exec',WEB,'nginx','-s','reload')
    assert digest(CONF)==OLDHASH
    print(json.dumps({'library_route_removed':True,'original_v54_config_restored':True,'bookmarks_preserved':True}))

if __name__=='__main__':
    assert STAGE.resolve()==STAGE and not STAGE.is_symlink()
    {'stage':stage,'activate':activate,'rollback':rollback,'verify':lambda:print(json.dumps(verify(18790)))}[sys.argv[1]]()
