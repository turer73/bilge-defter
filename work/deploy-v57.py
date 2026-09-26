"""Hash-guarded v57 release. Run on Klipper with sudo; never log inspect/env.

Modes: prepare, stage, activate, verify, rollback. Existing containers retained.
Backups contain private data: private/ is 0700 and must not enter Git.
"""
import hashlib, json, os, shutil, sqlite3, subprocess, sys, tarfile, time
from contextlib import closing
from pathlib import Path

ROOT=Path('/opt/bilge-defter-classroom-v57')
PRIOR=Path('/opt/bilge-defter-classroom-v56')
CURRENT=Path('/opt/bilge-defter-invited/current')
LIBROOT=Path('/opt/bilge-defter-library-v1')
WEB='bilge-defter-invited-web'; API='bilge-defter-accounts'; LIB='bilge-defter-library-v1'
NAMES=[WEB,API,LIB]
HASH='e5db524782bea09f10ffcd917ec8be238c6dd5c9af826a8eabca0aeb3c7cd411'
OLDHASH='1299aad3540395191cec3b43f2cbaf652b0c815f0f6f9a9814f2ce170b8dc25e'
CONFHASH='0efd97f119b2bc81b537f39782f5461f4ac3348efffdfe45d47b4e077dcb6e5a'
APIIMAGE='sha256:9c7b3e941788b7068b48173a29687da41429b227fc5a0dddd4cd7be4106dbf93'
LIBIMAGE='sha256:96eed6dc542afca240700857c633379e7d5992259903026f1f629b7a8df21359'
WEBIMAGE='sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236'

def run(*args,timeout=90):
    p=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
    if p.returncode:
        # No argv/inspect/env in error output. Build/tests have separate logs.
        raise RuntimeError(f'{args[0]} failed ({p.returncode}): {p.stderr[-500:]}')
    return p.stdout.strip()
def sha(path):
    with Path(path).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def inspect(name):
    p=subprocess.run(['docker','inspect',name],capture_output=True,text=True)
    if p.returncode:
        assert 'no such' in p.stderr.lower();return None
    return json.loads(p.stdout)[0]
def private_json(path,value):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f:json.dump(value,f,indent=2)
    os.chown(path,1000,1000)
def load(name):return json.loads((ROOT/'private'/name).read_text())
def protected():
    excluded=set(NAMES+[n+s for n in NAMES for s in ['-preview-v57','-rollback-v57','-failed-v57']])
    result=[]
    for ident in run('docker','ps','-aq').split():
        c=inspect(ident);name=c['Name'].lstrip('/')
        if name not in excluded:result.append([name,c['Id'],c['State']['Status'],c['State']['StartedAt']])
    return {'containers':sorted(result),'main_pid':run('systemctl','show','linux-ai-server','-p','MainPID','--value')}
def unchanged():assert protected()==load('protected.json'),'Unrelated runtime changed; review required'
def old():
    assert CURRENT.resolve()==PRIOR/'ui' and sha(PRIOR/'ui/SHA256SUMS')==OLDHASH
    assert sha(PRIOR/'classroom-nginx.conf')==CONFHASH
    for name,image in [(WEB,WEBIMAGE),(API,APIIMAGE),(LIB,LIBIMAGE)]:
        c=inspect(name);assert c and c['State']['Running'] and c['Image']==image,name
        if (ROOT/'private'/f'{name}.json').exists():assert c['Id']==load(f'{name}.json')['Id']
    assert sha(LIBROOT/'code/hosted.py')==load('old-library-hashes.json')['hosted.py'] if (ROOT/'private/old-library-hashes.json').exists() else True
def package():
    receipt=json.loads((ROOT/'source-receipt.json').read_text())
    assert sha(ROOT/'ui/SHA256SUMS')==HASH
    for line in (ROOT/'ui/SHA256SUMS').read_text().splitlines():
        digest,name=line.split(maxsplit=1);assert not Path(name).is_absolute() and '..' not in Path(name).parts
        assert sha(ROOT/'ui'/name)==digest,name
    for name,digest in receipt['files'].items():assert sha(ROOT/name)==digest,name
    assert sha(ROOT/'classroom-nginx.conf')==CONFHASH
    return receipt
def snapshot(source,dest):
    assert source.is_file() and not dest.exists()
    fd=os.open(dest,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600);os.close(fd)
    with closing(sqlite3.connect(source.as_uri()+'?mode=ro',uri=True)) as src, closing(sqlite3.connect(dest)) as out:
        src.backup(out,pages=128,sleep=.05);out.execute('PRAGMA journal_mode=DELETE')
        assert out.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
        assert not out.execute('PRAGMA foreign_key_check').fetchall()
    os.chown(dest,1000,1000)
    return sha(dest)
def prepare():
    old();assert not (ROOT/'private').exists()
    (ROOT/'private').mkdir(mode=0o700);os.chown(ROOT/'private',1000,1000)
    private_json(ROOT/'private/protected.json',protected())
    for name in NAMES:private_json(ROOT/'private'/f'{name}.json',inspect(name))
    private_json(ROOT/'private/old-library-hashes.json',{p.name:sha(p) for p in (LIBROOT/'code').iterdir() if p.is_file()})
    (ROOT/'classroom-nginx.conf').write_bytes((PRIOR/'classroom-nginx.conf').read_bytes())
    with tarfile.open(ROOT/'payload.tar.gz') as archive:
        for m in archive.getmembers():assert (m.isfile() or m.isdir()) and not Path(m.name).is_absolute() and '..' not in Path(m.name).parts
        archive.extractall(ROOT,filter='data')
    package()
    backups={}
    for label,source in [('accounts',Path('/opt/bilge-defter-classroom-v49/data/bilge-defter.sqlite')),('bookmarks',LIBROOT/'state/bookmarks.sqlite3')]:
        backups[label]=snapshot(source,ROOT/'private'/f'{label}.sqlite')
    (ROOT/'dictionary').mkdir()
    snapshot(Path('/opt/linux-ai-server/data/bilge_defter_dictionary.db'),ROOT/'dictionary/bilge_defter_dictionary.db')
    os.chmod(ROOT/'dictionary/bilge_defter_dictionary.db',0o444)
    private_json(ROOT/'private/backup-receipt.json',backups)
    old();unchanged();print(json.dumps({'prepared':True,'backups':backups,'package':HASH}))
def clone(name,source,preview=False):
    assert inspect(name) is None
    c=load(source+'.json');h=c['HostConfig'];cfg=c['Config']
    assert set(c['NetworkSettings']['Networks'])=={'bilge-defter-classroom'}
    assert h['ReadonlyRootfs'] and not h['Privileged']
    args=['docker','create','--name',name,'--network','bilge-defter-classroom','--read-only',
          '--restart','no' if preview else h['RestartPolicy']['Name'],'--memory',str(h['Memory']),
          '--pids-limit',str(h['PidsLimit'])]
    if h['NanoCpus']:args+=['--cpus',str(h['NanoCpus']/1e9)]
    if cfg['User']:args+=['--user',cfg['User']]
    if cfg['WorkingDir']:args+=['-w',cfg['WorkingDir']]
    for cap in h.get('CapDrop') or []:args+=['--cap-drop',cap]
    for cap in h.get('CapAdd') or []:args+=['--cap-add',cap]
    for opt in h.get('SecurityOpt') or []:args+=['--security-opt',opt]
    for dest,opt in (h.get('Tmpfs') or {}).items():args+=['--tmpfs',dest+':'+opt]
    log=h.get('LogConfig') or {}
    if log.get('Type'):args+=['--log-driver',log['Type']]
    for k,v in log.get('Config',{}).items():args+=['--log-opt',k+'='+v]
    env=list(cfg.get('Env') or [])
    if source==API:env=[e for e in env if not e.startswith('BILGE_DEFTER_DICT_DB=')]+['BILGE_DEFTER_DICT_DB=/dictionaries/bilge_defter_dictionary.db']
    # Env stays in a protected file, never in command output or process args.
    envpath=ROOT/'private'/f'{name}.env';assert not envpath.exists()
    fd=os.open(envpath,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f:
        assert all('\n' not in e and '\r' not in e for e in env);f.write('\n'.join(env)+'\n')
    args+=['--env-file',str(envpath)]
    for m in c['Mounts']:
        if m['Type']=='tmpfs':continue
        assert m['Type']=='bind'
        src=m['Source'];dest=m['Destination']
        if source==WEB:
            if dest=='/usr/share/nginx/html':src=str(ROOT/'ui')
            elif dest=='/etc/nginx/conf.d/default.conf':src=str(ROOT/('preview-nginx.conf' if preview else 'classroom-nginx.conf'))
            else:raise AssertionError(dest)
        elif source==LIB and dest=='/srv/library':src=str(ROOT/'library')
        if preview and dest in ['/data','/state']:
            state=ROOT/(source+'-preview-state');state.mkdir(mode=0o700)
            owner=10001 if source==API else 1000;os.chown(state,owner,owner)
            if source==LIB:
                with closing(sqlite3.connect(state/'bookmarks.sqlite3')) as db:db.execute('CREATE TABLE bookmarks (account TEXT NOT NULL,source TEXT NOT NULL,page INTEGER NOT NULL,PRIMARY KEY(account,source,page))')
                os.chown(state/'bookmarks.sqlite3',owner,owner)
            src=str(state)
        args+=['--mount',f'type=bind,src={src},dst={dest}'+('' if m['RW'] else ',readonly')]
    if source==API:args+=['--mount',f'type=bind,src={ROOT}/dictionary,dst=/dictionaries,readonly']
    if source==WEB:args+=['-p',f'127.0.0.1:{18800 if preview else 18790}:80']
    else:assert not h.get('PortBindings')
    if source==LIB:args+=['--health-cmd','/usr/bin/python3 /srv/library/healthcheck.py','--health-interval','30s','--health-timeout','5s','--health-retries','3','--health-start-period','60s']
    image=json.loads((ROOT/'images.json').read_text())['accounts'] if source==API else c['Image']
    entry=cfg.get('Entrypoint') or []
    if entry:args+=['--entrypoint',entry[0]]
    args+=[image]+entry[1:]+(cfg.get('Cmd') or [])
    try:run(*args)
    finally:envpath.unlink()
    run('docker','start',name)
    if source==WEB:run('docker','exec',name,'nginx','-t')
def verify(port):return json.loads(run('python3',str(ROOT/'verify-publication-v57.py'),str(ROOT/'ui'),str(port),timeout=120))
def await_health(name):
    for _ in range(60):
        c=inspect(name)
        if c['State'].get('Health',{}).get('Status')=='healthy':return
        time.sleep(1)
    raise RuntimeError('Library health did not become ready')
def stage():
    old();package();unchanged()
    offhost=json.loads((ROOT/'offhost-backups.json').read_text())
    assert offhost==load('backup-receipt.json')
    # The two images share the exact runtime layers; pytest exists only in verify.
    for target in ['production','verify']:
        with (ROOT/f'build-{target}.log').open('w') as log:
            p=subprocess.run(['docker','build','--network','default','--target',target,'-f',str(ROOT/'api/Dockerfile'),'-t',f'bilge-defter-accounts:v57-{target}',str(ROOT/'api')],stdout=log,stderr=subprocess.STDOUT,timeout=300)
        assert p.returncode==0,f'Build {target} failed; inspect build log'
    (ROOT/'images.json').write_text(json.dumps({'accounts':json.loads(run('docker','image','inspect','bilge-defter-accounts:v57-production'))[0]['Id']}))
    output=run('docker','run','--rm','--network','none','--read-only','--tmpfs','/tmp:rw,size=128m,mode=1777','--memory','768m','--cpus','1.5','--pids-limit','100','--cap-drop','ALL','--security-opt','no-new-privileges:true','--mount',f'type=bind,src={ROOT}/dictionary,dst=/dictionaries,readonly','bilge-defter-accounts:v57-verify',timeout=180)
    (ROOT/'api-tests.txt').write_text(output);assert '77 passed' in output,output[-500:]
    text=(ROOT/'classroom-nginx.conf').read_text().replace(API+':8080',API+'-preview-v57:8080').replace(LIB+':8080',LIB+'-preview-v57:8080')
    (ROOT/'preview-nginx.conf').write_text(text)
    for name in [API,LIB,WEB]:clone(name+'-preview-v57',name,True)
    await_health(LIB+'-preview-v57');proof=verify(18800)
    old();unchanged()
    (ROOT/'stage-proof.json').write_text(json.dumps({'web':proof,'api_tests':77,'runtime_python':run('docker','exec',API+'-preview-v57','python','--version'),'package':HASH}))
    print((ROOT/'stage-proof.json').read_text())
def point(path):
    assert CURRENT.is_symlink() and CURRENT.resolve() in [PRIOR/'ui',ROOT/'ui']
    temp=CURRENT.parent/'.current-v57';assert not temp.exists() and not temp.is_symlink()
    temp.symlink_to(path);temp.replace(CURRENT)
def rollback():
    # Stop the new web before changing its upstreams. Do not restore stale data.
    for name in [WEB,LIB,API]:
        prior=inspect(name+'-rollback-v57')
        if prior:
            assert prior['Id']==load(name+'.json')['Id']
            current=inspect(name)
            if current:
                assert current['Id']!=prior['Id'] and inspect(name+'-failed-v57') is None
                run('docker','stop',name);run('docker','rename',name,name+'-failed-v57')
            run('docker','rename',name+'-rollback-v57',name)
    for name in [API,LIB,WEB]:
        assert inspect(name)['Id']==load(name+'.json')['Id'];run('docker','start',name)
    point(PRIOR/'ui')
    result=json.loads(run('python3',str(PRIOR/'verify-publication-v56.py'),str(PRIOR/'ui'),'18790',timeout=120))
    unchanged();print(json.dumps({'rollback':'v56','verification':result,'data_restored':False}))
def activate():
    old();package();unchanged();assert json.loads((ROOT/'stage-proof.json').read_text())['package']==HASH
    verify(18800)
    for name in NAMES:assert inspect(name+'-rollback-v57') is None and inspect(name+'-failed-v57') is None
    try:
        for name in [WEB,LIB,API]:
            assert inspect(name)['Id']==load(name+'.json')['Id']
            run('docker','stop',name);run('docker','rename',name,name+'-rollback-v57')
        # No app/database migrations: all data mounts and secrets remain identical.
        for name in [API,LIB,WEB]:clone(name,name)
        await_health(LIB);proof=verify(18790);point(ROOT/'ui');unchanged()
        for name in [API,LIB]:
            oldmounts={m['Destination']:m['Source'] for m in load(name+'.json')['Mounts'] if m['Destination'] in ['/data','/state','/sources','/run/bilge-secrets']}
            newmounts={m['Destination']:m['Source'] for m in inspect(name)['Mounts'] if m['Destination'] in oldmounts}
            assert oldmounts==newmounts
    except BaseException:
        rollback();raise
    for name in NAMES:run('docker','stop',name+'-preview-v57')
    result={'published':'v57','package':HASH,'source':package()['commit'],'verification':proof,'api_python':run('docker','exec',API,'python','--version'),'library_health':inspect(LIB)['State']['Health']['Status'],'other_services_unchanged':True,'actual_user_and_ipad_tested':False,'rollback':'sudo python3 '+str(ROOT/'deploy-v57.py')+' rollback'}
    (ROOT/'live-proof.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
if __name__=='__main__':
    assert os.geteuid()==0 and ROOT.resolve()==ROOT and not ROOT.is_symlink()
    {'prepare':prepare,'stage':stage,'activate':activate,'rollback':rollback,'verify':lambda:print(json.dumps(verify(18790)))}[sys.argv[1]]()
