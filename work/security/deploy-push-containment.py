"""Single-file hash-guarded containment; no Git history rewrite or database access.

Invoke prepare then activate, or rollback, with sudo. Real JWT login is not mocked.
GitHub lacks the live parent, so this patch is recorded in the client release repo.
"""
import ast,hashlib,json,os,stat,subprocess,sys,time
from pathlib import Path
from urllib.request import urlopen
from urllib.error import HTTPError

ROOT=Path('/opt/bilge-defter-classroom-v57/security')
TARGET=Path('/opt/linux-ai-server/app/api/bilge_defter.py')
OLD='54dcda4a267d45e2a8e803ba0b6d0deaed1ecba697a59d5a0e40720bf6b09b93'
NEW='78813c823cb3a745671c635ed09754e8e0d910345977d2b06abe805bcbf8a245'
NAMES={'_notify_other_devices','vapid_key','push_subscription'}
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def run(*args,cwd=None):return subprocess.check_output(args,cwd=cwd,text=True,stderr=subprocess.PIPE,timeout=90).strip()
def containers():return run('docker','ps','-a','--no-trunc','--format','{{.ID}} {{.Names}} {{.State}}')
def verify_ast(old,new):
    left,right=ast.parse(old),ast.parse(new)
    stripped=lambda tree:ast.dump(ast.Module(body=[n for n in tree.body if not isinstance(n,ast.FunctionDef) or n.name not in NAMES],type_ignores=[]))
    assert stripped(left)==stripped(right),'Changes beyond the three approved functions'
    funcs=[n for n in right.body if isinstance(n,ast.FunctionDef) and n.name in NAMES]
    assert len(funcs)==3
    # Execute exactly these source functions with forbidden DB/network stubs.
    class Denied(Exception):
        def __init__(self,status_code,detail=''):self.status_code=status_code
    def forbidden(*a,**kw):raise AssertionError('Unexpected DB or network call')
    def auth(token):
        if token!='synthetic':raise Denied(401)
        return {'email':'synthetic@example.invalid'}
    for n in funcs:n.decorator_list=[]
    tree=ast.Module(body=[ast.ImportFrom(module='__future__',names=[ast.alias(name='annotations')],level=0),*funcs],type_ignores=[])
    scope={'Header':lambda **kw:None,'HTTPException':Denied,'_require_access':auth,'get_conn':forbidden,'_db_path':forbidden,'_vapid_keys':forbidden,'webpush':forbidden}
    exec(compile(ast.fix_missing_locations(tree),str(TARGET),'exec'),scope)
    assert scope['_notify_other_devices']('x','y','z') is None
    for token,code in [(None,401),('synthetic',503)]:
        for name,args in [('vapid_key',[token]),('push_subscription',[object(),token])]:
            try:scope[name](*args)
            except Denied as exc:assert exc.status_code==code
            else:raise AssertionError('Push was not denied')
def health():
    for _ in range(45):
        try:
            with urlopen('http://127.0.0.1:8420/openapi.json',timeout=3) as r:
                body=json.loads(r.read());assert '/api/v1/bilge-defter/vapid-key' in body['paths']
            with urlopen('http://127.0.0.1:8420/api/v1/bilge-defter/whoami',timeout=3) as r:
                assert json.loads(r.read())['identity']['type']=='device'
            try:urlopen('http://127.0.0.1:8420/api/v1/bilge-defter/vapid-key',timeout=3)
            except HTTPError as exc:assert exc.code==401
            else:raise AssertionError('Unauthenticated key request accepted')
            assert run('systemctl','is-active','linux-ai-server')=='active'
            return
        except Exception:time.sleep(1)
    raise RuntimeError('Shared service health not restored')
def install(source,expected):
    assert sha(TARGET)==expected
    st=TARGET.stat();temp=TARGET.with_name('bilge_defter.py.v57-new')
    assert not temp.exists()
    fd=os.open(temp,os.O_CREAT|os.O_EXCL|os.O_WRONLY,stat.S_IMODE(st.st_mode))
    with os.fdopen(fd,'wb') as f:f.write(source.read_bytes());f.flush();os.fsync(f.fileno())
    os.chown(temp,st.st_uid,st.st_gid);temp.replace(TARGET)
def prepare():
    assert sha(TARGET)==OLD and not (ROOT/'before.py').exists()
    (ROOT/'before.py').write_bytes(TARGET.read_bytes())
    tree=ROOT/'candidate';(tree/'app/api').mkdir(parents=True)
    (tree/'app/api/bilge_defter.py').write_bytes(TARGET.read_bytes())
    patch=ROOT/'push-containment.patch'
    assert [l for l in patch.read_text().splitlines() if l.startswith('diff --git')]==['diff --git a/app/api/bilge_defter.py b/app/api/bilge_defter.py']
    run('git','apply','--check',str(patch),cwd=tree)
    run('git','apply',str(patch),cwd=tree)
    candidate=tree/'app/api/bilge_defter.py';assert sha(candidate)==NEW
    verify_ast(TARGET.read_text(),candidate.read_text());compile(candidate.read_text(),str(TARGET),'exec')
    (ROOT/'prepared.json').write_text(json.dumps({'old':OLD,'new':NEW,'actual_functions_isolated_checks':5,'database_modified':False}))
    print((ROOT/'prepared.json').read_text())
def activate():
    assert sha(TARGET)==OLD and sha(ROOT/'before.py')==OLD
    candidate=ROOT/'candidate/app/api/bilge_defter.py';assert sha(candidate)==NEW
    verify_ast(TARGET.read_text(),candidate.read_text());before=containers()
    try:
        install(candidate,OLD);run('systemctl','restart','linux-ai-server');health()
    except BaseException:
        if sha(TARGET)==NEW:install(ROOT/'before.py',NEW)
        run('systemctl','restart','linux-ai-server');health();raise
    assert containers()==before and sha(TARGET)==NEW
    proof={'published':True,'old':OLD,'new':NEW,'service':'active','live_auth_rejection':401,'actual_functions_isolated_checks':5,'containers_unchanged':True,'database_modified':False,'git_head_changed':False}
    (ROOT/'live-proof.json').write_text(json.dumps(proof,indent=2));print(json.dumps(proof))
def rollback():
    assert sha(ROOT/'before.py')==OLD
    install(ROOT/'before.py',NEW);run('systemctl','restart','linux-ai-server');health()
    print('Original shared source restored; unsafe push behavior also restored. Review before use.')
if __name__=='__main__':
    assert os.geteuid()==0 and ROOT.resolve()==ROOT and not ROOT.is_symlink()
    {'prepare':prepare,'activate':activate,'rollback':rollback}[sys.argv[1]]()
