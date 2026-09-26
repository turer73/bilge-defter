"""Allowlisted deployment payload from one committed tree, never working data."""
import hashlib,json,subprocess,tarfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'outputs/v57-release'
OUT.mkdir(parents=True,exist_ok=True)
COMMIT=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
def git(path):return subprocess.check_output(['git','show',f'{COMMIT}:{path}'],cwd=ROOT)
paths={}
for name in subprocess.check_output(['git','ls-tree','-r','--name-only',COMMIT,'server-candidate/v49/app','server-candidate/v49/tests'],cwd=ROOT,text=True).splitlines():
    paths['api/'+name.removeprefix('server-candidate/v49/')]=git(name)
paths['api/Dockerfile']=git('work/release-v57.Dockerfile')
paths['api/tests/test_release_dictionary.py']=git('work/test-release-dictionary-v57.py')
for name in ['server.py','prepare.py','hosted.py','healthcheck.py','backup_state.py','textview.py','quote.js','catalog.json','accepted-sources.json','app.js','index.html','style.css']:
    paths['library/'+name]=git('work/library-pilot/'+name)
for name in ['deploy-v57.py','verify-publication-v57.py']:
    paths[name]=git('work/'+name)
ui=ROOT/'work/bilge-defter-invited-v57'
assert hashlib.sha256((ui/'SHA256SUMS').read_bytes()).hexdigest()=='e5db524782bea09f10ffcd917ec8be238c6dd5c9af826a8eabca0aeb3c7cd411'
for line in (ui/'SHA256SUMS').read_text().splitlines():
    digest,name=line.split(maxsplit=1)
    data=(ui/name).read_bytes();assert hashlib.sha256(data).hexdigest()==digest
    paths['ui/'+name]=data
paths['ui/SHA256SUMS']=(ui/'SHA256SUMS').read_bytes()
receipt={'commit':COMMIT,'package':'v57','files':{name:hashlib.sha256(data).hexdigest() for name,data in paths.items()}}
paths['source-receipt.json']=json.dumps(receipt,indent=2).encode()
import io
with tarfile.open(OUT/'payload.tar.gz','w:gz') as archive:
    for name,data in paths.items():
        assert not Path(name).is_absolute() and '..' not in Path(name).parts
        info=tarfile.TarInfo(name);info.size=len(data);info.mode=0o644
        archive.addfile(info,io.BytesIO(data))
(OUT/'source-receipt.json').write_bytes(paths['source-receipt.json'])
print(json.dumps({'commit':COMMIT,'files':len(paths),'payload_sha256':hashlib.sha256((OUT/'payload.tar.gz').read_bytes()).hexdigest()}))
