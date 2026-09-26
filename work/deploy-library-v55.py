"""Web-only v55 entry release; retain v54 web and library JS rollback. No account data access."""
import hashlib,json,subprocess,sys,tarfile,time
from pathlib import Path
STAGE=Path('/opt/bilge-defter-classroom-v55');PRIOR=Path('/opt/bilge-defter-classroom-v54/ui');CURRENT=Path('/opt/bilge-defter-invited/current')
WEB='bilge-defter-invited-web';PREVIEW='bilge-defter-web-preview-v55';ROLLBACK='bilge-defter-invited-web-rollback-v55';FAILED='bilge-defter-invited-web-failed-v55'
OLD='37f5d2c0e6b08a84613ab111c89fa67f99aa0820eada92a09e4b6d3dd5373b0d'
IMAGE='sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236'
CONFHASH='0efd97f119b2bc81b537f39782f5461f4ac3348efffdfe45d47b4e077dcb6e5a'
LIBJS=Path('/opt/bilge-defter-library-v1/code/app.js');LIBHASH='6eadded40859b553eec9bea4d59cc0cf5c5e6650475e310cb2e8a76213d45881'
def cmd(*args):return subprocess.check_output(args,text=True,timeout=90).strip()
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def inspect(name):
    p=subprocess.run(['docker','inspect',name],capture_output=True,text=True,timeout=20)
    if p.returncode:
        assert 'no such' in p.stderr.lower();return None
    x=json.loads(p.stdout)[0]
    return {'id':x['Id'],'name':x['Name'].lstrip('/'),'started':x['State']['StartedAt'],'status':x['State']['Status'],'image':x['Image']}
def others():
    values=[inspect(i) for i in cmd('docker','ps','-aq').split()]
    return {'containers':sorted([x for x in values if x['name'] not in {WEB,PREVIEW,ROLLBACK,FAILED}],key=lambda x:x['name']), 'pid':cmd('systemctl','show','linux-ai-server','-p','MainPID','--value')}
def unchanged():assert others()==json.loads((STAGE/'before.json').read_text())
def old():
    assert inspect(WEB)['id']==OLD and inspect(WEB)['status']=='running'
    assert CURRENT.resolve()==PRIOR
    assert sha(PRIOR/'SHA256SUMS')=='be5f789bc33c6d57c443c4c3d77642a31a15c4274212f589e37dfdacbb42b740'
    assert sha(PRIOR.parent/'classroom-nginx.conf')==CONFHASH and sha(LIBJS)==LIBHASH
def package():
    r=json.loads((STAGE/'build-receipt.json').read_text());assert r['version']=='v55' and r['pdfFeatureAdded'] is False
    assert sha(STAGE/'ui/SHA256SUMS')==r['packageHash'] and sha(STAGE/'classroom-nginx.conf')==CONFHASH
    for line in (STAGE/'ui/SHA256SUMS').read_text().splitlines():
        digest,name=line.split(maxsplit=1);assert '..' not in Path(name).parts and not name.startswith('/');assert sha(STAGE/'ui'/name)==digest
    assert sha(STAGE/'library-app.js')==json.loads((STAGE/'extra-receipt.json').read_text())['libraryHash']
def web(name,port):
    assert inspect(name) is None
    cmd('docker','run','-d','--name',name,'--restart','unless-stopped','--network','bilge-defter-classroom','--read-only','--memory','128m','--cpus','0.5','--pids-limit','100','--tmpfs','/var/cache/nginx:rw,noexec,nosuid,size=16m','--tmpfs','/var/run:rw,noexec,nosuid,size=1m','--cap-drop','ALL','--cap-add','CHOWN','--cap-add','SETGID','--cap-add','SETUID','--security-opt','no-new-privileges:true','-p',f'127.0.0.1:{port}:80','-v',str(STAGE/'ui')+':/usr/share/nginx/html:ro','-v',str(STAGE/'classroom-nginx.conf')+':/etc/nginx/conf.d/default.conf:ro',IMAGE)
    for n in range(20):
        p=subprocess.run(['docker','exec',name,'nginx','-t'],capture_output=True,timeout=10)
        if p.returncode==0:return
        time.sleep(.25)
    raise RuntimeError('Nginx not ready')
def verify(port):return json.loads(cmd('python3',str(STAGE/'verify-publication-v55.py'),str(STAGE/'ui'),str(port)))
def point(target):
    assert CURRENT.is_symlink() and CURRENT.resolve() in {PRIOR,STAGE/'ui'} and target in {PRIOR,STAGE/'ui'}
    if CURRENT.resolve()==target:return
    temp=CURRENT.parent/'.current-v55';assert not temp.exists() and not temp.is_symlink()
    cmd('sudo','-n','ln','-s',str(target),str(temp));cmd('sudo','-n','mv','-T',str(temp),str(CURRENT));assert CURRENT.resolve()==target
def replace_library(source):
    # Parent directory bind mount observes atomic replacement; source never contains user data.
    temp=LIBJS.parent/'app.js.v55-tmp';assert not temp.exists();temp.write_bytes(source.read_bytes());temp.replace(LIBJS)
def rollback():
    assert inspect(ROLLBACK)['id']==OLD
    assert sha(LIBJS) in {LIBHASH,sha(STAGE/'library-app.js')}
    if inspect(WEB):
        mounts=json.loads(cmd('docker','inspect',WEB,'--format','{{json .Mounts}}'));assert any(m['Source']==str(STAGE/'ui') for m in mounts)
        assert inspect(FAILED) is None;cmd('docker','stop',WEB);cmd('docker','rename',WEB,FAILED)
    cmd('docker','rename',ROLLBACK,WEB);cmd('docker','start',WEB);point(PRIOR)
    replace_library(STAGE/'library-app-before.js');assert sha(LIBJS)==LIBHASH
def main():
    assert STAGE.resolve()==STAGE and not STAGE.is_symlink()
    mode=sys.argv[1]
    if mode=='rollback':unchanged();rollback();unchanged();print('v54 restored; bookmarks and source PDFs retained');return
    old()
    if mode=='stage':
        assert not (STAGE/'before.json').exists() and inspect(PREVIEW) is None
        (STAGE/'before.json').write_text(json.dumps(others(),indent=2))
        (STAGE/'classroom-nginx.conf').write_bytes((PRIOR.parent/'classroom-nginx.conf').read_bytes())
        (STAGE/'library-app-before.js').write_bytes(LIBJS.read_bytes())
        dest=STAGE/'ui';dest.mkdir()
        with tarfile.open(STAGE/'ui.tar.gz') as archive:
            for m in archive.getmembers():assert (m.isfile() or m.isdir()) and not Path(m.name).is_absolute() and '..' not in Path(m.name).parts
            archive.extractall(dest,filter='data')
        package();web(PREVIEW,18798);proof=verify(18798);old();unchanged()
        (STAGE/'preview-receipt.json').write_text(json.dumps(proof,indent=2));print(json.dumps(proof));return
    assert mode=='activate';package();unchanged();verify(18798)
    assert inspect(ROLLBACK) is None and inspect(FAILED) is None
    old()
    try:
        replace_library(STAGE/'library-app.js')
        cmd('docker','stop',WEB);cmd('docker','rename',WEB,ROLLBACK)
        web(WEB,18790);proof=verify(18790);point(STAGE/'ui');unchanged()
        assert sha(LIBJS)==sha(STAGE/'library-app.js')
    except BaseException:
        if inspect(ROLLBACK):rollback()
        else:
            if inspect(WEB) and inspect(WEB)['id']==OLD:cmd('docker','start',WEB)
            replace_library(STAGE/'library-app-before.js')
        raise
    (STAGE/'origin-receipt.json').write_text(json.dumps(proof,indent=2));cmd('docker','stop',PREVIEW);unchanged()
    print(json.dumps({'published':'v55','rollback':'v54','library_js_updated':True,'other_services_unchanged':True,'checks':proof}))
if __name__=='__main__':main()
