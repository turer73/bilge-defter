"""Scoped library code update; no app, account, source PDF or bookmark-data deployment."""
import hashlib,json,subprocess,sys,time
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
STAGE=Path('/opt/bilge-defter-library-text-v1');BASE=Path('/opt/bilge-defter-library-v1')
LIB='bilge-defter-library-v1';PREVIEW='bilge-defter-library-text-preview-v1'
LIBID='4d19208fb0e59a3f2cfa7973132d0e07a4982a911e1bcfa1d0b7de098761b35b'
IMAGE='sha256:96eed6dc542afca240700857c633379e7d5992259903026f1f629b7a8df21359'
OLD={'server.py':'88ad449e51adc8ee7a4f5861803531675965a15fe31c8584d60e9aa68503ad61','app.js':'6dbe35ebffa77c936ba96cba87bd79b7daea4849eb60a7e1b825871a487a1025','style.css':'8f6df7634686334b5389a0728a994ea3766616d011b5cce2f0c7e1a9dd95865c'}
CHANGED=[*OLD,'textview.py']
def cmd(*args):return subprocess.check_output(args,text=True,timeout=90).strip()
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def inspect(name):
    p=subprocess.run(['docker','inspect',name],capture_output=True,text=True,timeout=10)
    if p.returncode:assert 'no such' in p.stderr.lower();return None
    x=json.loads(p.stdout)[0];return {'id':x['Id'],'name':x['Name'].lstrip('/'),'started':x['State']['StartedAt'],'status':x['State']['Status']}
def protected():
    values=[inspect(i) for i in cmd('docker','ps','-aq').split()]
    return {'containers':sorted([x for x in values if x['name'] not in {LIB,PREVIEW}],key=lambda x:x['name']),'main':cmd('systemctl','show','linux-ai-server','-p','MainPID','--value')}
def unchanged():assert protected()==json.loads((STAGE/'before.json').read_text())
def old():
    assert inspect(LIB)['id']==LIBID and inspect(LIB)['status']=='running'
    for name,digest in OLD.items():assert sha(BASE/'code'/name)==digest,name
    assert not (BASE/'code/textview.py').exists()
def incoming():
    manifest=json.loads((STAGE/'manifest.json').read_text())
    assert set(manifest)=={*CHANGED,'test_text.py'}
    for name,digest in manifest.items():assert sha(STAGE/'incoming'/name)==digest
    return manifest
def deny(port,prefix=''):
    for route in ['/read/msu-neuroscience/14?account=invalid','/api/saved','/api/catalog']:
        for token in ['', 'invalid-test-token']:
            try:
                with urlopen(Request(f'http://127.0.0.1:{port}'+prefix+route,headers={'Host':'defter.bilgearena.com','Cf-Access-Jwt-Assertion':token}),timeout=15) as r:raise AssertionError(r.status)
            except HTTPError as e:assert e.code==401 and 'error' in json.loads(e.read())
def main_app():
    return json.loads(cmd('python3','/opt/bilge-defter-classroom-v55/verify-publication-v55.py','/opt/bilge-defter-classroom-v55/ui','18790'))
def install(name,source):
    target=BASE/'code'/name;temp=target.with_name(name+'.text-tmp');assert not temp.exists()
    temp.write_bytes(source.read_bytes());temp.replace(target)
def restore():
    for name in OLD:install(name,STAGE/'backup'/name)
    # Keep the now-unused helper for recovery evidence; old server does not import it.
    cmd('docker','restart',LIB)
    for name,digest in OLD.items():assert sha(BASE/'code'/name)==digest
def main():
    assert STAGE.resolve()==STAGE and not STAGE.is_symlink()
    mode=sys.argv[1];manifest=incoming()
    if mode=='rollback':
        unchanged();assert inspect(LIB)['id']==LIBID
        for name in CHANGED:assert sha(BASE/'code'/name)==manifest[name]
        restore();main_app();unchanged();print('Prior library reader restored; source PDFs and bookmarks preserved');return
    old()
    if mode=='stage':
        assert not (STAGE/'before.json').exists() and inspect(PREVIEW) is None
        (STAGE/'before.json').write_text(json.dumps(protected(),indent=2));backup=STAGE/'backup';backup.mkdir();code=STAGE/'code';code.mkdir()
        for p in (BASE/'code').iterdir():
            if p.is_file():(code/p.name).write_bytes(p.read_bytes())
        for name in OLD:(backup/name).write_bytes((BASE/'code'/name).read_bytes())
        for name in manifest:(code/name).write_bytes((STAGE/'incoming'/name).read_bytes())
        state=STAGE/'preview-state';state.mkdir();cmd('sudo','-n','chown','1000:1000',str(state));cmd('sudo','-n','chmod','700',str(state))
        cmd('docker','run','-d','--name',PREVIEW,'--network','bilge-defter-classroom','--read-only','--user','1000:1000','--memory','512m','--cpus','0.75','--pids-limit','64','--cap-drop','ALL','--security-opt','no-new-privileges:true','--tmpfs','/cache:rw,noexec,nosuid,size=64m,uid=1000,gid=1000','--tmpfs','/tmp:rw,noexec,nosuid,size=64m,uid=1000,gid=1000','-p','127.0.0.1:18799:8080','-v',str(code)+':/srv/library:ro','-v',str(BASE/'sources')+':/sources:ro','-v',str(state)+':/state:rw','-e','LIBRARY_DATA=/sources','-e','LIBRARY_CACHE=/cache','-e','LIBRARY_STATE=/state','-e','PYTHONDONTWRITEBYTECODE=1','-w','/srv/library','--entrypoint','/usr/bin/python3',IMAGE,'hosted.py')
        for attempt in range(20):
            try:deny(18799);break
            except Exception:
                if attempt==19:raise
                time.sleep(.5)
        cmd('docker','exec',PREVIEW,'python3','-m','unittest','-v','test_text','test_hosted');main_app();unchanged();old()
        (STAGE/'preview-proof.json').write_text(json.dumps({'tests':21,'auth_rejections':6,'manifest':manifest},indent=2));print('Preview passed 21 tests and 6 auth rejections; v55 app intact');return
    assert mode=='activate';assert json.loads((STAGE/'preview-proof.json').read_text())['manifest']==manifest
    unchanged();deny(18799);old()
    try:
        for name in CHANGED:install(name,STAGE/'incoming'/name)
        cmd('docker','restart',LIB)
        for attempt in range(30):
            try:deny(18790,'/library');break
            except Exception:
                if attempt==29:raise
                time.sleep(.5)
        for name in CHANGED:assert sha(BASE/'code'/name)==manifest[name]
        proof=main_app();unchanged();assert inspect(LIB)['id']==LIBID and inspect(LIB)['status']=='running'
    except BaseException:restore();raise
    cmd('docker','stop',PREVIEW);unchanged()
    (STAGE/'live-proof.json').write_text(json.dumps({'reader':'text-v1','files':manifest,'app':proof,'other_services_unchanged':True,'real_device':False},indent=2));print('Published library text reader; main v55 and other services unchanged')
if __name__=='__main__':main()
