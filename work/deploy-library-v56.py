"""Coordinated v56 web and library-code cutover. No user-data deployment."""
import hashlib,json,subprocess,sys,tarfile,time
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
STAGE=Path('/opt/bilge-defter-classroom-v56');PRIOR=Path('/opt/bilge-defter-classroom-v55/ui');CURRENT=Path('/opt/bilge-defter-invited/current')
BASE=Path('/opt/bilge-defter-library-v1');WEB='bilge-defter-invited-web';LIB='bilge-defter-library-v1'
PREVIEW='bilge-defter-web-preview-v56';LP='bilge-defter-library-quote-preview-v56';ROLLBACK='bilge-defter-invited-web-rollback-v56';FAILED='bilge-defter-invited-web-failed-v56'
OLDWEB='3edfef6421530ed1aab3c3204f4fac40c278ad0e02ba91435ed3e0d9fe0ec3ae';OLDLIB='4d19208fb0e59a3f2cfa7973132d0e07a4982a911e1bcfa1d0b7de098761b35b'
IMAGE='sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236';LIBIMAGE='sha256:96eed6dc542afca240700857c633379e7d5992259903026f1f629b7a8df21359'
CONFHASH='0efd97f119b2bc81b537f39782f5461f4ac3348efffdfe45d47b4e077dcb6e5a'
HASH='1299aad3540395191cec3b43f2cbaf652b0c815f0f6f9a9814f2ce170b8dc25e'
OLD={'server.py':'429d8f712a06aaf034d78fc4734ce60c7a9211d2007ad890130a7f9964b5f514','textview.py':'7bb80d445c670d6eb1c559f2f8665108ede5e73a8ff3be5a5e1f477b2466a2bc','style.css':'00232be57cf8dc83ebe14b16cda691883578f9cbbeebb5d2818fb9b869689e99'}
CHANGED=[*OLD,'quote.js']
def cmd(*a):return subprocess.check_output(a,text=True,timeout=90).strip()
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def inspect(name):
    p=subprocess.run(['docker','inspect',name],capture_output=True,text=True,timeout=15)
    if p.returncode:assert 'no such' in p.stderr.lower();return None
    x=json.loads(p.stdout)[0];return {'id':x['Id'],'name':x['Name'].lstrip('/'),'started':x['State']['StartedAt'],'status':x['State']['Status']}
def protected():
    v=[inspect(i) for i in cmd('docker','ps','-aq').split()]
    return {'containers':sorted([x for x in v if x['name'] not in {WEB,LIB,PREVIEW,LP,ROLLBACK,FAILED}],key=lambda x:x['name']),'main_pid':cmd('systemctl','show','linux-ai-server','-p','MainPID','--value')}
def unchanged():assert protected()==json.loads((STAGE/'before.json').read_text())
def old():
    assert inspect(WEB)['id']==OLDWEB and inspect(WEB)['status']=='running'
    assert inspect(LIB)['id']==OLDLIB and inspect(LIB)['status']=='running'
    assert CURRENT.resolve()==PRIOR and sha(PRIOR/'SHA256SUMS')=='aff91996f0b38aeccf2d3689ee5bbbe9602d767991ec3b0f33b209790f356c19'
    assert sha(PRIOR.parent/'classroom-nginx.conf')==CONFHASH
    for name,digest in OLD.items():assert sha(BASE/'code'/name)==digest,name
    assert not (BASE/'code/quote.js').exists()
def package():
    r=json.loads((STAGE/'build-receipt.json').read_text());assert r['packageHash']==HASH and r['candidate']=='v56'
    assert sha(STAGE/'ui/SHA256SUMS')==HASH and sha(STAGE/'classroom-nginx.conf')==CONFHASH
    for line in (STAGE/'ui/SHA256SUMS').read_text().splitlines():
        digest,name=line.split(maxsplit=1);assert '..' not in Path(name).parts and not name.startswith('/');assert sha(STAGE/'ui'/name)==digest
    for name in CHANGED:assert sha(STAGE/'incoming'/name)==r['libraryCode'][name]
def verify(port):return json.loads(cmd('python3',str(STAGE/'verify-publication-v56.py'),str(STAGE/'ui'),str(port)))
def deny(port,prefix=''):
    for route in ['/quote.js?account=invalid','/read/msu-neuroscience/14?account=invalid','/api/session','/api/saved']:
        for token in ['', 'invalid-test-token']:
            try:
                with urlopen(Request(f'http://127.0.0.1:{port}'+prefix+route,headers={'Host':'defter.bilgearena.com','Cf-Access-Jwt-Assertion':token}),timeout=15) as r:raise AssertionError(r.status)
            except HTTPError as e:assert e.code==401 and 'error' in json.loads(e.read())
def await_deny(port,prefix=''):
    for n in range(30):
        try:deny(port,prefix);return
        except Exception:
            if n==29:raise
            time.sleep(.5)
def web(name,port):
    assert inspect(name) is None
    cmd('docker','run','-d','--name',name,'--restart','unless-stopped','--network','bilge-defter-classroom','--read-only','--memory','128m','--cpus','0.5','--pids-limit','100','--tmpfs','/var/cache/nginx:rw,noexec,nosuid,size=16m','--tmpfs','/var/run:rw,noexec,nosuid,size=1m','--cap-drop','ALL','--cap-add','CHOWN','--cap-add','SETGID','--cap-add','SETUID','--security-opt','no-new-privileges:true','-p',f'127.0.0.1:{port}:80','-v',str(STAGE/'ui')+':/usr/share/nginx/html:ro','-v',str(STAGE/'classroom-nginx.conf')+':/etc/nginx/conf.d/default.conf:ro',IMAGE)
    cmd('docker','exec',name,'nginx','-t')
def point(target):
    assert CURRENT.is_symlink() and CURRENT.resolve() in {PRIOR,STAGE/'ui'} and target in {PRIOR,STAGE/'ui'}
    if CURRENT.resolve()==target:return
    temp=CURRENT.parent/'.current-v56';assert not temp.exists() and not temp.is_symlink()
    cmd('sudo','-n','ln','-s',str(target),str(temp));cmd('sudo','-n','mv','-T',str(temp),str(CURRENT))
def install(name,source):
    target=BASE/'code'/name;temp=target.with_name(name+'.v56-tmp');assert not temp.exists();temp.write_bytes(source.read_bytes());temp.replace(target)
def restore_library():
    for name in OLD:install(name,STAGE/'library-backup'/name)
    # New helper is unused by restored old server; keep for recovery evidence.
    cmd('docker','restart',LIB)
    for name,digest in OLD.items():assert sha(BASE/'code'/name)==digest
def rollback():
    assert inspect(LIB)['id']==OLDLIB
    if inspect(ROLLBACK):
        assert inspect(ROLLBACK)['id']==OLDWEB
        if inspect(WEB):
            mounts=json.loads(cmd('docker','inspect',WEB,'--format','{{json .Mounts}}'));assert any(m['Source']==str(STAGE/'ui') for m in mounts)
            assert inspect(FAILED) is None;cmd('docker','stop',WEB);cmd('docker','rename',WEB,FAILED)
        cmd('docker','rename',ROLLBACK,WEB);cmd('docker','start',WEB)
    else:
        assert inspect(WEB)['id']==OLDWEB;cmd('docker','start',WEB)
    point(PRIOR);restore_library();await_deny(18790,'/library')
    return json.loads(cmd('python3','/opt/bilge-defter-classroom-v55/verify-publication-v55.py',str(PRIOR),'18790'))
def main():
    assert STAGE.resolve()==STAGE and not STAGE.is_symlink()
    mode=sys.argv[1]
    if mode=='rollback':
        unchanged();package()
        for name in CHANGED:assert sha(BASE/'code'/name)==sha(STAGE/'incoming'/name)
        proof=rollback();unchanged();print(json.dumps({'restored':'v55','proof':proof}));return
    old()
    if mode=='stage':
        assert not (STAGE/'before.json').exists() and inspect(PREVIEW) is None and inspect(LP) is None
        (STAGE/'before.json').write_text(json.dumps(protected(),indent=2))
        (STAGE/'classroom-nginx.conf').write_bytes((PRIOR.parent/'classroom-nginx.conf').read_bytes())
        dest=STAGE/'ui';dest.mkdir()
        with tarfile.open(STAGE/'ui.tar.gz') as archive:
            for m in archive.getmembers():assert (m.isfile() or m.isdir()) and not Path(m.name).is_absolute() and '..' not in Path(m.name).parts
            archive.extractall(dest,filter='data')
        package();backup=STAGE/'library-backup';backup.mkdir();code=STAGE/'library-preview';code.mkdir()
        for p in (BASE/'code').iterdir():
            if p.is_file():(code/p.name).write_bytes(p.read_bytes())
        for name in OLD:(backup/name).write_bytes((BASE/'code'/name).read_bytes())
        for name in [*CHANGED,'test_text.py']:(code/name).write_bytes((STAGE/'incoming'/name).read_bytes())
        state=STAGE/'preview-state';state.mkdir();cmd('sudo','-n','chown','1000:1000',str(state));cmd('sudo','-n','chmod','700',str(state))
        cmd('docker','run','-d','--name',LP,'--no-healthcheck','--network','bilge-defter-classroom','--read-only','--user','1000:1000','--memory','512m','--cpus','0.75','--pids-limit','64','--cap-drop','ALL','--security-opt','no-new-privileges:true','--tmpfs','/cache:rw,noexec,nosuid,size=64m,uid=1000,gid=1000','--tmpfs','/tmp:rw,noexec,nosuid,size=64m,uid=1000,gid=1000','-p','127.0.0.1:18801:8080','-v',str(code)+':/srv/library:ro','-v',str(BASE/'sources')+':/sources:ro','-v',str(state)+':/state:rw','-e','LIBRARY_DATA=/sources','-e','LIBRARY_CACHE=/cache','-e','LIBRARY_STATE=/state','-e','PYTHONDONTWRITEBYTECODE=1','-w','/srv/library','--entrypoint','/usr/bin/python3',LIBIMAGE,'hosted.py')
        await_deny(18801);cmd('docker','exec',LP,'python3','-m','unittest','-v','test_text','test_hosted')
        web(PREVIEW,18800);proof=verify(18800);old();unchanged()
        (STAGE/'preview-proof.json').write_text(json.dumps({'web':proof,'library_tests':22,'auth_rejections':8,'package':HASH},indent=2));print('Preview passed; live v55 unchanged');return
    assert mode=='activate';package();unchanged();assert json.loads((STAGE/'preview-proof.json').read_text())['package']==HASH
    verify(18800);deny(18801);old();assert inspect(ROLLBACK) is None and inspect(FAILED) is None
    try:
        cmd('docker','stop',WEB);cmd('docker','rename',WEB,ROLLBACK);web(WEB,18790)
        for name in CHANGED:install(name,STAGE/'incoming'/name)
        cmd('docker','restart',LIB);await_deny(18790,'/library');proof=verify(18790)
        for name in CHANGED:assert sha(BASE/'code'/name)==sha(STAGE/'incoming'/name)
        point(STAGE/'ui');unchanged();assert inspect(LIB)['id']==OLDLIB and inspect(LIB)['status']=='running'
    except BaseException:rollback();raise
    cmd('docker','stop',PREVIEW);cmd('docker','stop',LP);unchanged()
    result={'published':'v56','package':HASH,'web':proof,'library_hashes':{n:sha(BASE/'code'/n) for n in CHANGED},'library_auth_rejections':8,'other_services_unchanged':True,'real_account_tested':False,'existing_library_healthcheck':'inherited PDF probe remains incorrect','rollback':'python3 '+str(STAGE/'deploy-library-v56.py')+' rollback'}
    (STAGE/'live-proof.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
if __name__=='__main__':main()
